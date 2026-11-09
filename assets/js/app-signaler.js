/**
 * 🐞 « Signaler un problème » : une fenêtre qui prépare le message — ce qui s'est passé, ce que j'attendais (champs
 * libres) et, en pièce jointe visible et modifiable, un rapport technique : version, système, taille de la base (nombres
 * seulement, GET report_info → lib/signaler.php), réglages d'affichage utiles et les 50 dernières erreurs captées par
 * app-journal.js (déjà nettoyées : ni nom, ni date, ni lieu, ni chemin de fichier).
 * Puis « 📋 Copier », « ✉️ Écrire un e-mail » (si une adresse est réglée dans Réglages → 🔄 Mises à jour) ou
 * « Ouvrir une demande sur GitHub » (issue pré-remplie). Rien n'est envoyé tout seul.
 * Entrées : Réglages → FAQ / tuto et Infos, Réglages → 🔄 Mises à jour, menu Aide de l'application de bureau, tout bouton
 * [data-report-problem]. Test : tests/test-signaler-probleme.js.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI;
    const J = () => window.LCNDA_JOURNAL;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => (A()?.escapeHtml ? A().escapeHtml(v ?? '') : String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));
    const ISSUES = 'https://github.com/victorbaissait/lcnda/issues/new';
    const PREF = 'lcnda-signaler'; // {email} : adresse des signalements (vide au départ → seulement GitHub)
    const URL_MAX = 7000, MAIL_MAX = 1800;

    const prefs = () => { try { const o = JSON.parse(localStorage.getItem(PREF) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };
    const email = () => { const e = String(prefs().email || '').trim(); return /^[^\s@<>"',;:()]{1,64}@[\w.-]{1,190}\.[a-z]{2,24}$/i.test(e) ? e : ''; };
    const nf = n => Number(n || 0).toLocaleString('fr-FR');
    const size = b => (b >= 1e9 ? `${String(Math.round(b / 1e8) / 10).replace('.', ',')} Go` : b >= 1e6 ? `${String(Math.round(b / 1e5) / 10).replace('.', ',')} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`);
    const ago = t => { const s = Math.max(0, (Date.now() - Number(t || 0)) / 1000); return s < 90 ? 'à l’instant' : s < 5400 ? `il y a ${Math.round(s / 60)} min` : s < 129600 ? `il y a ${Math.round(s / 3600)} h` : `il y a ${Math.round(s / 86400)} j`; };
    const KIND = {js: 'JS', promise: 'JS (promesse)', console: 'JS (console)', server: 'Serveur'};
    const OS = {darwin: 'macOS', win32: 'Windows', linux: 'Linux'};
    const id = v => (/^[a-z0-9_-]{1,40}$/i.test(String(v || '')) ? String(v) : '');

    /** navigateur et système d'après la page (sans rien d'autre que des noms de logiciels et des numéros) */
    function browserLine() {
        const ua = navigator.userAgent || '';
        const m = /Electron\/(\d+)/.exec(ua) ? `Electron ${/Electron\/(\d+)/.exec(ua)[1]}` : /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)[1]}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)[1]}`
            : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)[1]}` : /Version\/(\d+)[\d.]*.*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)[1]}` : 'autre navigateur';
        const os = /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'autre système';
        return `${m} · ${os}`;
    }
    /** réglages d'affichage utiles : attributs data-… de <html> à valeur courte (designs, accessibilité, thème) */
    function displayLine() {
        const html = document.documentElement, out = [];
        const dark = ({dark: 'sombre', light: 'clair'})[html.dataset.theme] || (matchMedia?.('(prefers-color-scheme: dark)').matches ? 'sombre (système)' : 'clair (système)');
        out.push(`thème ${dark}`);
        Object.entries(html.dataset).forEach(([k, v]) => { if (k !== 'theme' && /^(lc|a11y|look|density|font|reduce|contrast|tb|ui)/i.test(k) && /^[\w.%-]{1,24}$/.test(v) && out.length < 30) out.push(`${k}=${v}`); });
        if (html.classList.contains('a11y-simple')) out.push('une chose à la fois');
        if (document.body?.classList.contains('is-kiosk')) out.push('mode consultation');
        return out.join(' · ');
    }
    async function gather() {
        const info = {server: null, desk: null};
        try { info.server = await A().api('report_info'); } catch (_) {}
        try { info.desk = await window.lcnda?.updates?.info?.(); } catch (_) {}
        return info;
    }
    /** la pièce jointe (texte), à partir de ce qu'on sait ; les erreurs du journal sont nettoyées encore une fois */
    function attachment({server = null, desk = null} = {}, errors = J()?.list?.() || []) {
        const s = server || {}, c = s.counts || {}, st = A()?.state || {};
        const version = (desk && desk.version) || s.version || '?';
        const lines = [];
        lines.push(`LCNDA ${version} · ${desk ? 'application de bureau' : 'dans un navigateur'}`);
        if (desk) lines.push(`Ordinateur : ${OS[desk.platform] || id(desk.platform) || '?'} ${id(desk.arch)}${desk.format ? ` (${id(desk.format)})` : ''}`);
        lines.push(`Navigateur : ${browserLine()}`);
        lines.push(`Serveur : PHP ${String(s.php || '').replace(/[^\d.]/g, '').slice(0, 12) || '?'} · SQLite ${String(s.sqlite || '?').replace(/[^\d.]/g, '')} · ${id(s.os) || '?'} · structure de la base n° ${Number(s.schema) || '?'}`);
        const parts = [['persons', 'fiche', 'fiches'], ['animals', 'animal', 'animaux'], ['families', 'famille', 'familles'], ['events', 'événement', 'événements'], ['places', 'lieu', 'lieux'], ['media', 'média', 'médias'], ['sources', 'source', 'sources'], ['notes', 'note', 'notes']]
            .filter(([k]) => Number.isFinite(Number(c[k]))).map(([k, one, many]) => `${nf(c[k])} ${Number(c[k]) > 1 ? many : one}`);
        lines.push(`Base : ${parts.join(' · ') || '?'}${s.db_bytes ? ` · ${size(s.db_bytes)}` : ''}`);
        lines.push(`Écran : ${screen.width} × ${screen.height} (×${Math.round((devicePixelRatio || 1) * 100) / 100}) · fenêtre ${innerWidth} × ${innerHeight}`);
        lines.push(`Affichage : ${displayLine()}`);
        lines.push(`Page : ${[id(st.module), id(st.module === 'maintenance' ? st.maintenanceTab : st.module === 'listes' ? st.listType : '')].filter(Boolean).join(' · ') || '?'}`);
        const scrub = J()?.scrub || (x => '');
        const errs = errors.slice(-50);
        lines.push('');
        lines.push(errs.length ? `Erreurs captées (${errs.length}, la plus récente en bas) :` : 'Erreurs captées : aucune.');
        errs.forEach(e => lines.push(`- ${ago(e.t)} · ${KIND[e.kind] || 'JS'} · ${scrub(e.msg).replace(/\s*\n\s*/g, ' ⏎ ')}${e.where ? ` (${scrub(e.where)})` : ''}${e.n > 1 ? ` ×${e.n}` : ''}`));
        return lines.join('\n');
    }
    /** le message complet (titre + texte) */
    function compose({what = '', expected = '', attach = '', joined = true} = {}) {
        const first = String(what || '').trim().split(/\n/)[0].slice(0, 80);
        const title = `Problème : ${first || 'à décrire'}`;
        const body = `### Ce qui s’est passé\n${String(what || '').trim() || '(à décrire)'}\n\n### Ce que j’attendais\n${String(expected || '').trim() || '(à décrire)'}\n${joined && attach ? `\n### Rapport technique (sans aucune donnée de ma généalogie)\n\`\`\`\n${attach}\n\`\`\`\n` : ''}`;
        return {title, body};
    }
    /** coupe le texte pour qu'il tienne dans une adresse (GitHub, e-mail) ; cut = vrai si le texte a été coupé */
    function fit(prefix, title, body, max, titleKey = 'title', bodyKey = 'body') {
        const enc = encodeURIComponent;
        let b = body, cut = false;
        const url = () => `${prefix}${prefix.includes('?') ? '&' : '?'}${titleKey}=${enc(title)}&${bodyKey}=${enc(b)}`;
        while (url().length > max && b.length > 200) { b = b.slice(0, Math.floor(b.length * 0.85)); cut = true; }
        if (cut) b += '\n\n[…texte coupé : la suite est copiée, colle-la ici]';
        return {url: url(), cut};
    }
    const githubUrl = (title, body) => fit(ISSUES, title, body, URL_MAX);
    const mailUrl = (to, title, body) => fit(`mailto:${encodeURIComponent(to).replace(/%40/g, '@')}`, title, body, MAIL_MAX, 'subject', 'body');

    async function copy(text) {
        try { await navigator.clipboard.writeText(text); return true; }
        catch (_) {
            const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); return ok;
        }
    }
    const openOut = url => { const w = window.open(url, '_blank', 'noopener'); if (!w && /^mailto:/.test(url)) location.href = url; };

    /** la fenêtre */
    async function open() {
        if (document.documentElement.classList.contains('ms-open')) return; // rien en mode simple
        const info = await gather();
        const att = attachment(info);
        const nErr = (J()?.list?.() || []).length;
        const to = email();
        const body = `<div class="rp-form">
            <label class="rp-field">Ce qui s’est passé<textarea name="what" rows="4" maxlength="4000" placeholder="Ex. : j’ai cliqué sur « Enregistrer » dans la fiche, et la fenêtre est restée grise." data-rp-what></textarea></label>
            <label class="rp-field">Ce que j’attendais<textarea name="expected" rows="3" maxlength="4000" placeholder="Ex. : que la fiche soit enregistrée et que la fenêtre se ferme."></textarea></label>
            <p class="ui-hint">Écris avec tes mots. Évite les noms de ta famille si tu ne veux pas qu’ils soient lus.</p>
            <div class="rp-attach">
                ${UI()?.checkHtml ? UI().checkHtml(`Joindre le rapport technique (${nErr ? A().plural(nErr, 'erreur captée', 'erreurs captées') : 'aucune erreur captée'})`, {checked: true, attrs: 'name="joined" data-rp-joined'}) : '<label class="checkbox-line"><input type="checkbox" name="joined" checked data-rp-joined> Joindre le rapport technique</label>'}
                <textarea name="attach" rows="10" class="rp-attach-text" spellcheck="false" data-rp-attach aria-label="Rapport technique">${esc(att)}</textarea>
                <p class="ui-hint">ℹ️ Rien de ta généalogie n’est dedans : les noms, dates, lieux et chemins de fichiers sont enlevés des erreurs, la base est décrite seulement par des nombres. Tu peux tout relire et effacer ce que tu veux.</p>
            </div>
            ${to ? '' : '<p class="ui-hint">Pour écrire un e-mail plutôt qu’ouvrir une demande sur GitHub : règle une adresse dans Réglages → « 🔄 Mises à jour ».</p>'}
        </div>`;
        const d = ext.openDialog({eyebrow: 'AIDE', title: '🐞 Signaler un problème', wide: true, body, onOpen: dlg => {
            dlg.classList.add('rp-dialog');
            const acts = dlg.querySelector('.modal-actions');
            acts.innerHTML = `<button type="button" class="button secondary danger" data-rp-clear title="Vider le journal des erreurs captées sur cet ordinateur">🗑 Vider le journal</button><span class="spacer"></span><button type="button" class="button secondary" data-rp-cancel>Annuler</button><button type="button" class="button secondary" data-rp-copy>📋 Copier</button>${to ? '<button type="button" class="button secondary" data-rp-mail>✉️ Écrire un e-mail</button>' : ''}<button type="button" class="button" data-rp-github>Ouvrir une demande sur GitHub</button>`;
        }});
        const form = d.querySelector('form');
        const msg = () => { const f = new FormData(form); return compose({what: f.get('what'), expected: f.get('expected'), attach: f.get('attach'), joined: !!form.querySelector('[data-rp-joined]')?.checked}); };
        const ta = form.querySelector('[data-rp-attach]');
        form.querySelector('[data-rp-joined]')?.addEventListener('change', e => { ta.disabled = !e.target.checked; });
        d.querySelector('[data-rp-cancel]').addEventListener('click', () => d.close());
        d.querySelector('[data-rp-clear]').addEventListener('click', () => {
            const before = J()?.list?.() || [];
            J()?.clear?.();
            ta.value = attachment(info, []);
            A().undoToast('Journal des erreurs vidé', {undo: () => { before.forEach(e => J()?.add?.(e.kind, e.msg, e.where)); ta.value = attachment(info); }});
        });
        d.querySelector('[data-rp-copy]').addEventListener('click', async () => {
            const m = msg();
            const ok = await copy(`${m.title}\n\n${m.body}`);
            A().toast(ok ? '✓ Message copié : colle-le où tu veux (e-mail, forum, GitHub).' : 'La copie n’a pas marché : sélectionne le texte et copie-le à la main.', ok ? 'success' : 'error');
        });
        d.querySelector('[data-rp-mail]')?.addEventListener('click', async () => {
            const m = msg(), r = mailUrl(email(), m.title, m.body);
            if (r.cut) { await copy(m.body); A().toast('Le message est long : il est coupé dans l’e-mail, et le texte complet est copié. Colle-le à la fin.'); }
            openOut(r.url);
        });
        d.querySelector('[data-rp-github]').addEventListener('click', async () => {
            const m = msg();
            if (!String(new FormData(form).get('what') || '').trim()) return UI()?.fail ? UI().fail(form.querySelector('[data-rp-what]'), 'Dis en quelques mots ce qui s’est passé.') : null;
            const r = githubUrl(m.title, m.body);
            if (r.cut) { await copy(m.body); A().toast('Le message est long : il est coupé dans la demande, et le texte complet est copié. Colle-le à la place.'); }
            openOut(r.url);
        });
        setTimeout(() => form.querySelector('[data-rp-what]')?.focus(), 30);
        return d;
    }

    ext.reportProblem = {open, attachment, compose, githubUrl, mailUrl, email, PREF, ISSUES};
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-report-problem]'); if (!b) return; e.preventDefault(); open(); });
    try { window.lcnda?.onCommand?.(cmd => { if (cmd === 'report-problem') open(); }); } catch (_) {}
})();
