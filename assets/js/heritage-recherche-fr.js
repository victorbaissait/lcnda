/**
 * 🔎 Réglages → 🔎 Recherche : la recherche « à la française » (moteur : lib/recherche_fr.php et assets/js/app-recherche-fr.js).
 *  - Phonétique automatique (quand rien n'est trouvé : « Aucun « Dupond » ; 3 personnes proches : Dupont, Dupon, Dupons »)
 *  - Formes latines des prénoms (Petrus = Pierre, Joannes = Jean…)
 *  - Abréviations et diminutifs des prénoms (J.-Bte, Fçois, Jh, Toinette, Jeannette…)
 *  - Marge de « vers » (± 5 ans au départ, comme ailleurs dans l'app)
 * Rangés comme les autres réglages de l'interface (clé genealogie-recherche-fr, gardée aussi dans la base : le serveur la lit).
 * « Essayer » montre ce que la recherche comprend d'un texte (GET rfr_parse), sans rien chercher.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const R = () => window.LCNDA_RFR;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const KEY = 'genealogie-recherche-fr';
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const S = () => A()?.state || {};

    function read() { try { return R().settingsClean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (_) { return R() ? R().settingsClean(null) : {auto: true, latin: true, abr: true, vers: 5}; } }
    async function save(v) {
        const json = JSON.stringify(v);
        try { localStorage.setItem(KEY, json); } catch (_) {}
        // tout de suite dans la base aussi : c'est le serveur qui cherche
        try { await A().api('save_settings', {}, {method: 'POST', body: {set: {[KEY]: json}, remove: []}}); } catch (_) {}
    }

    const KIND = {fr: 'forme française', latin: 'forme latine', decl: 'forme latine', abr: 'abréviation', dim: 'diminutif', colle: 'prénom composé'};
    function understood(d) {
        const p = d.parsed || {}, out = [];
        (p.tokens || []).forEach(t => {
            const bits = [];
            if (t.first) bits.push(i18n('prénom de référence : {p} ({k})', {p: t.first.fr, k: i18n(KIND[t.first.kind] || 'forme française')}));
            if (t.merged === 'particle') bits.push(i18n('nom avec particule : {a} = {b}', {a: t.glued, b: t.bare}));
            if (t.phon) bits.push(i18n('son : {s}', {s: t.phon}));
            out.push(`<li><b>${esc(t.raw)}</b> <small class="muted">${esc(bits.join(' · '))}</small></li>`);
        });
        (p.dates || []).forEach(x => {
            const span = x.from !== null && x.to !== null ? (x.from === x.to ? String(x.from) : `${x.from} – ${x.to}`) : x.from !== null ? i18n('à partir de {y}', {y: x.from}) : i18n('jusqu’à {y}', {y: x.to});
            out.push(`<li>📅 <b>${esc(x.label)}</b> <small class="muted">${esc(x.ymd && x.ymd.length === 10 ? i18n('le {d}', {d: x.ymd}) : span)}</small></li>`);
        });
        return out.length ? `<ul class="rfr-understood">${out.join('')}</ul>` : `<p class="muted">${esc(i18n('Rien de reconnu.'))}</p>`;
    }

    ext.maintenance = ext.maintenance || {};
    ext.maintenance.recherche_fr = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        if (token !== undefined && token !== S().workspaceToken) return;
        const v = read(), ro = kiosk();
        const tog = (k, label, hint) => `<label class="ui-toggle"><input type="checkbox" data-rfr-set="${k}" ${v[k] ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i><span>${esc(i18n(label))}${hint ? `<small class="muted"${hint.raw ? ' data-i18n-off' : ''}> — ${esc(hint.raw || i18n(hint))}</small>` : ''}</span></label>`;
        ws.innerHTML = `<section class="page rfr-page">${UI().pageHeader ? UI().pageHeader({where: i18n('Réglages · Recherche'), title: i18n('Recherche'), help: esc(i18n('La même recherche partout. Sous chaque résultat : pourquoi il a été trouvé.'))}) : `<h2>${esc(i18n('🔎 Recherche'))}</h2>`}
            <section class="maintenance-panel"><h3>${esc(i18n('Ce que la recherche essaie'))}</h3>
                ${tog('auto', 'Phonétique automatique', 'quand rien n’est trouvé, les noms qui se prononcent pareil')}
                ${tog('latin', 'Formes latines des prénoms', 'Petrus = Pierre, Joannes = Jean, avec leurs fins (-i, -o, -um, -ae)')}
                ${tog('abr', 'Abréviations et diminutifs des prénoms', {raw: 'J.-Bte, Fçois, Jh, Cath., Toinette, Jeannette, Marianne = Marie-Anne'})}
                <label class="rfr-vers">${esc(i18n('Marge de « vers » (en années)'))} <input type="number" min="0" max="30" step="1" data-rfr-vers value="${esc(v.vers)}" ${ro ? 'disabled' : ''}></label>
                <p class="muted">${esc(i18n('Toujours : accents, majuscules, particules (d’Albert = Dalbert), St = Saint, communes fusionnées, dates en français et calendrier républicain.'))}</p>
            </section>
            <section class="maintenance-panel"><h3>${esc(i18n('Essayer'))}</h3>
                <p class="muted">${esc(i18n('Écris une recherche : l’app montre ce qu’elle comprend, sans rien chercher.'))}</p>
                <input type="search" data-rfr-try placeholder="${esc(i18n('ex. {x}', {x: 'Jn Bte de la Combe vers 1850'}))}" aria-label="${esc(i18n('Essayer une recherche'))}" spellcheck="false">
                <div data-rfr-out></div>
            </section></section>`;
        ws.querySelectorAll('[data-rfr-set]').forEach(el => el.addEventListener('change', async () => { const n = read(); n[el.dataset.rfrSet] = el.checked; await save(n); A().toast?.(i18n('Réglage enregistré.'), 'success'); }));
        ws.querySelector('[data-rfr-vers]')?.addEventListener('change', async e => { const n = read(); n.vers = Math.max(0, Math.min(30, Math.trunc(Number(e.target.value) || 0))); e.target.value = n.vers; await save(n); A().toast?.(i18n('Réglage enregistré.'), 'success'); });
        let timer = 0, seq = 0;
        const box = ws.querySelector('[data-rfr-try]'), out = ws.querySelector('[data-rfr-out]');
        box?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const q = box.value.trim(), id = ++seq;
                if (!q) { out.innerHTML = ''; return; }
                let d; try { d = await A().api('rfr_parse', {q}); } catch (e) { out.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
                if (id === seq) out.innerHTML = understood(d);
            }, 200);
        });
    };
})();
