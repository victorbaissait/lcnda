/**
 * LCNDA — 📦 Les grands packs des lots K et L, installés à la demande (lib/grands_packs.php, scripts/grands-packs.js).
 * Ils ne sont pas livrés avec l'app (trop gros) : les biens protégés par pays (tk-patrimoine_<pays>), les cimetières du monde
 * (tl-cimetieres), les mines du monde (tl-mines)… Ils se téléchargent une fois (Réglages → 🗂 Données, ou le bouton
 * « 📦 Installer (≈ N Mo) » de Réglages → 🌍 Le monde à côté et → 🌐 Les équivalents d'ailleurs), puis ils sont lus sans Internet,
 * à l'adresse habituelle assets/data/<pack>.json.gz (le routeur les sert). Rien en mode consultation.
 * Rien n'est demandé à Internet avant un clic : la taille « ≈ » est celle connue de l'app ; le sommaire en ligne est lu au clic.
 * window.LCNDA_EXT.grandsPacks = {status, info, installed, install, remove, offerHtml, nameOf, approx, FAMILY}
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const A = () => root.LCNDA_APP || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => (A().escapeHtml ? A().escapeHtml(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const api = (a, q = {}) => A().api(a, q);
    const post = async (a, body = {}) => { const r = await A().api(a, {}, {method: 'POST', body}); return r && typeof r === 'object' && r.result && typeof r.result === 'object' ? r.result : r; };
    const toast = (m, k) => A().toast?.(m, k);
    const kiosk = () => !!(root.document?.body?.classList.contains('is-kiosk') || root.LCNDA_GUEST);
    const fmtSize = b => { b = Number(b) || 0; return b >= 1e6 ? `${(Math.round(b / 1e5) / 10).toLocaleString('fr-FR')} ${T('Mo')}` : `${Math.max(1, Math.round(b / 1e3))} ${T('Ko')}`; };
    const ID_RE = /^t[kl]-[a-z]+(_[a-z]{2,5})?$/;

    /* les packs connus de l'app et leur poids (≈, la dernière fabrication) : le bouton le dit sans rien demander à Internet */
    const PAYS = {gb: 'Royaume-Uni', ie: 'Irlande', nl: 'Pays-Bas', be: 'Belgique', lu: 'Luxembourg', de: 'Allemagne', ch: 'Suisse', at: 'Autriche', it: 'Italie', es: 'Espagne',
        pt: 'Portugal', dk: 'Danemark', no: 'Norvège', se: 'Suède', fi: 'Finlande', is: 'Islande', ee: 'Estonie', lv: 'Lettonie', lt: 'Lituanie', pl: 'Pologne',
        cz: 'Tchéquie', sk: 'Slovaquie', hu: 'Hongrie', si: 'Slovénie', hr: 'Croatie', ro: 'Roumanie', bg: 'Bulgarie', gr: 'Grèce', mt: 'Malte', mc: 'Monaco',
        ad: 'Andorre', li: 'Liechtenstein', ca: 'Canada', us: 'États-Unis'};
    const SIZE = {ad: 3772, at: 1094138, be: 214082, bg: 6546, ch: 580016, cz: 1417818, de: 10077769, dk: 451860, ee: 173314, es: 1793916, fi: 306587, gb: 16193959, gr: 120645, hr: 24315,
        hu: 8400, ie: 19208, is: 991, it: 1469981, li: 2147, lt: 1558, lu: 4345, lv: 49834, mc: 661, mt: 17248, nl: 1647793, no: 352386, pl: 2255011, pt: 393550, ro: 85426, se: 5756362,
        si: 73909, sk: 57539, 'tl-cimetieres': 4279325, 'tl-mines': 3590188};
    const OTHER = {'tl-cimetieres': '✝️ Cimetières du monde (Wikidata)', 'tl-mines': '⛏ Mines du monde (USGS MRDS)'};
    const nameOf = id => { const m = String(id).match(/^tk-patrimoine_([a-z]{2})$/); return m ? `🏛 ${T('Biens protégés')} · ${T(PAYS[m[1]] || m[1].toUpperCase())}` : T(OTHER[id] || id); };
    const approx = id => { const m = String(id).match(/^tk-patrimoine_([a-z]{2})$/); return (m ? SIZE[m[1]] : SIZE[id]) || 0; };
    const KNOWN = [...Object.keys(PAYS).map(c => `tk-patrimoine_${c}`), ...Object.keys(OTHER)];

    /* ─────────── l'état (local) et le sommaire en ligne (au clic seulement) ─────────── */
    let statusP = null, infoP = null;
    const status = (fresh = false) => { if (fresh || !statusP) statusP = api('gp_status').catch(e => { statusP = null; throw e; }); return statusP; };
    const info = (fresh = false) => { if (fresh || !infoP) infoP = api('gp_dl_info').catch(() => ({packs: {}, offline: true})); return infoP; };
    /** les packs installés (re : seulement ceux-là) */
    const installed = async (re = null) => Object.keys((await status().catch(() => null))?.packs || {}).filter(id => ID_RE.test(id) && (!re || re.test(id)));
    const changed = () => { statusP = null; try { root.dispatchEvent?.(new Event('lcnda:installs-changed')); } catch (_) {} redraw(); };
    root.addEventListener?.('lcnda:installs-changed', () => { statusP = null; });
    /* la page ouverte se redessine (chaque lot range sa page dans ext.maintenance) */
    const redraw = () => { const tab = A().state?.maintenanceTab; if (A().state?.module === 'maintenance' && tab && ext.maintenance?.[tab]) { try { ext.maintenance[tab](); } catch (_) {} } };

    /* ─────────── 📦 installer (un pack à la fois ; ↶ Annuler) ─────────── */
    let running = null;
    const progress = (id, txt) => root.document?.querySelectorAll(`[data-gp-progress="${id}"]`).forEach(el => { el.textContent = txt; });
    async function install(ids, {quiet = false} = {}) {
        if (kiosk()) { toast(T('Mode consultation : rien ne se télécharge.'), 'error'); return false; }
        if (running) { toast(T('Un téléchargement est déjà en cours.')); return false; }
        const list = [].concat(ids).filter(id => ID_RE.test(id));
        const done = [];
        running = list;
        try {
            const on = await info(true);
            for (const id of list) {
                if (!on?.packs?.[id]) throw new Error(on?.offline ? (on.error || T('Pas de connexion aux données en ligne.')) : T('« {name} » n’est pas encore en ligne.', {name: nameOf(id)}));
                progress(id, '0 %');
                const s = await post('gp_dl_start', {id}); if (s?.error) throw new Error(s.error);
                for (let fails = 0; ;) {
                    try { const r = await post('gp_dl_step', {id: s.id}); fails = 0; progress(id, `${Math.round(100 * r.received / Math.max(1, r.size))} %`); if (r.done) break; }
                    catch (e) { if (++fails >= 4) { await post('gp_dl_cancel', {id: s.id}).catch(() => {}); throw e; } await new Promise(res => setTimeout(res, 1500 * fails)); }
                }
                const f = await post('gp_dl_finish', {id: s.id}); if (f?.error) throw new Error(f.error);
                done.push(id);
            }
        } catch (e) { toast(T('L’installation n’a pas marché : {e}', {e: e?.message || String(e)}), 'error'); }
        finally { running = null; list.forEach(id => progress(id, '')); changed(); }
        if (done.length && !quiet) {
            const undo = async () => { for (const id of done.slice().reverse()) await post('gp_pack_undo', {id}).catch(() => {}); changed(); };
            const msg = done.length === 1 ? T('⤓ {name} installé.', {name: nameOf(done[0])}) : T('⤓ {n} packs installés.', {n: done.length});
            A().undoToast ? A().undoToast(msg, {undo, icon: '📦'}) : toast(msg, 'success');
        }
        return done.length === list.length;
    }
    async function remove(id) {
        if (kiosk()) return;
        try { await post('gp_pack_remove', {id}); } catch (e) { toast(e.message, 'error'); return; }
        changed();
        const undo = async () => { await post('gp_pack_restore', {id}); changed(); };
        const msg = T('🗑 {name} retiré.', {name: nameOf(id)});
        A().undoToast ? A().undoToast(msg, {undo, redo: () => remove(id), icon: '🗑'}) : toast(msg);
    }
    /** le bouton « 📦 Installer (≈ N Mo) » d'un ou de plusieurs packs ; rien en mode consultation */
    function offerHtml(ids, {label = ''} = {}) {
        const list = [].concat(ids).filter(id => ID_RE.test(id)); if (!list.length || kiosk()) return '';
        const size = list.reduce((n, id) => n + approx(id), 0);
        const txt = label || (size ? T('Installer (≈ {s})', {s: fmtSize(size)}) : T('Installer'));
        return `<button type="button" class="button small secondary" data-gp-install="${esc(list.join(','))}">📦 ${esc(txt)}</button> <span class="muted" data-gp-progress="${esc(list[0])}"></span>`;
    }
    const removeHtml = id => (kiosk() ? '' : `<button type="button" class="btn-link" data-gp-remove="${esc(id)}" title="${esc(T('Retirer ce pack'))}">🗑</button>`);
    if (root.document) root.document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-gp-install]'); if (b) { e.preventDefault(); b.disabled = true; install(b.dataset.gpInstall.split(',')).finally(() => { if (b.isConnected) b.disabled = false; }); return; }
        const r = e.target.closest?.('[data-gp-remove]'); if (r) { e.preventDefault(); remove(r.dataset.gpRemove); }
    });

    /* ─────────── 🗂 Réglages → Données : la famille « gp » (app-listes-maj.js : file, pause, ↶, 🗑) ─────────── */
    const FAMILY = {id: 'gp', icon: '📦', theme: 'Lieux et histoire', tab: '', status: 'gp_status', info: 'gp_dl_info', pre: 'gp', finish: 'gp_dl_finish', body: k => ({id: k}), multi: true,
        source: 'Wikidata ; USGS (voir chaque pack)', licence: 'CC0 1.0, domaine public', url: 'https://github.com/victorbaissait/lcnda/releases',
        installed: (s, k) => !!s?.packs?.[k], built: (s, k) => s?.packs?.[k]?.built || '', size: (s, k) => s?.packs?.[k]?.size || 0, online: (i, k) => i?.packs?.[k],
        itemsOf: (s, i) => [...new Set([...KNOWN, ...Object.keys(s?.packs || {}), ...Object.keys(i?.packs || {})])].filter(id => ID_RE.test(id))
            .map(k => ({k, name: nameOf(k), what: i?.packs?.[k]?.rows ? T('{n} lignes', {n: Number(i.packs[k].rows).toLocaleString('fr-FR')}) : '', approx: approx(k), licence: s?.packs?.[k]?.licence || i?.packs?.[k]?.licence || ''}))};
    function addFamily() { const M = ext.listesMaj; if (!M?.families || M.families.some(f => f.id === FAMILY.id)) return !!M?.families; M.families.push(FAMILY); return true; }
    if (root.document && !addFamily()) root.document.addEventListener('DOMContentLoaded', () => { if (!addFamily()) setTimeout(addFamily, 500); }, {once: true});

    ext.grandsPacks = {status, info, installed, install, remove, offerHtml, removeHtml, nameOf, approx, fmtSize, FAMILY, KNOWN, ID_RE};
})(typeof window !== 'undefined' ? window : globalThis);
