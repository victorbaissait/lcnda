/**
 * LCNDA — 🌐 Traduction hors ligne (lot D) : allemand, italien, espagnol, néerlandais, polonais, portugais, anglais → français,
 * SUR CET ORDINATEUR (Argos Translate, logiciel libre MIT / CC0 ; modèles de l'index d'Argos, licence écrite dans chaque paquet).
 * Rien n'est envoyé sur Internet : ni l'acte, ni la note. Serveur : lib/telech_d_traduction.php (routes td_tr_*).
 *  - Atelier de transcription : bouton « 🌐 Traduire hors ligne » à côté de « 📖 Aide à la lecture » quand la langue de l'acte est
 *    l'une de ces langues (le latin a déjà son « 🌐 Traduire », plus-famille-latin.js : Argos n'a pas de modèle latin) ; traduit la
 *    sélection, sinon tout le texte ; « ＋ Garder dans la transcription » (champ Traduction, ↶).
 *  - Notes d'une fiche : un petit « 🌐 » sur une note écrite dans une autre langue.
 *  - À la demande : « 🌐 Traduire un texte (hors ligne) » (LCNDA_EXT.dataSources).
 *  - Installation : Réglages → « 🧭 Mémoire et vieux papiers » (et Réglages → 🗂 Données : une ligne par langue, même file).
 *   window.LCNDA_EXT.telechTraduire = {detect, translate, status, install, settingsInto, openDialog}
 */
(function (root) {
    'use strict';
    const T = (s, v) => (root.LCNDA_I18N ? root.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    /* ── la langue d'un texte (mots très courants ; sans réseau) ── */
    const STOP = {
        fr: 'le la les et de du des est ne nee baptise fils fille au aux un une dans pour que qui sur son sa ses',
        la: 'et est filius filia natus nata baptizatus baptizata anno domini die mensis ejusdem eiusdem cum in qui quae ego testes patrinus matrina hujus huius',
        de: 'der die das und ist von zu den mit des im ein eine getauft geboren kind vater mutter sohn tochter wurde jahre am',
        it: 'il di che e del della nato nata battezzato battezzata figlio figlia padre madre un una nel alla anno',
        es: 'el los las de que y del nacido nacida bautizado bautizada hijo hija padre madre en con por año',
        nl: 'de het een van en is geboren gedoopt zoon dochter vader moeder op te met door jaar',
        en: 'the and of was born baptized baptised son daughter father mother in to with by year on at',
        pl: 'i w z na sie syn corka urodzony urodzona ochrzczony ochrzczona ojciec matka roku dnia',
        pt: 'o os de que e do da nascido nascida batizado batizada filho filha pai mae em com por ano'};
    const SETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' '))]));
    const foldW = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function detect(text) {
        const words = foldW(text).match(/[a-z]+/g) || []; if (words.length < 3) return '';
        const score = Object.fromEntries(Object.keys(SETS).map(k => [k, 0]));
        for (const w of words.slice(0, 400)) for (const k in SETS) if (SETS[k].has(w)) score[k]++;
        const best = Object.entries(score).sort((a, b) => b[1] - a[1]);
        return best[0][1] >= 2 && best[0][1] > best[1][1] ? best[0][0] : '';
    }
    const OCR = {deu: 'de', ita: 'it', spa: 'es', nld: 'nl', eng: 'en', pol: 'pl', por: 'pt', lat: 'la', fra: 'fr'};
    const langOfOcr = v => { const parts = String(v || '').toLowerCase().split('+'); return parts.includes('fra') && parts.length === 1 ? 'fr' : parts.includes('lat') ? 'la' : (OCR[parts[0]] || ''); };
    const LANGS = {de: 'Allemand', it: 'Italien', es: 'Espagnol', nl: 'Néerlandais', pl: 'Polonais', pt: 'Portugais', en: 'Anglais'};
    const core = {detect, langOfOcr, LANGS};
    if (typeof module === 'object' && module.exports) { module.exports = core; return; }

    const A = () => root.LCNDA_APP || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const api = (...a) => A().api(...a);
    const post = (a, b) => api(a, {}, {method: 'POST', body: b}).then(r => r?.result || r);
    const link = (url, label) => `<a href="${esc(/^\s*(?:javascript|data|vbscript|file):/i.test(String(url)) ? '#' : url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`; // une adresse venue d’un site (Wikidata, loc.gov…) : jamais « javascript: »
    const langName = k => T(LANGS[k] || k).toLowerCase();
    let st = null, stErr = ''; // stErr : la vérification a échoué (serveur) — ce n'est pas « pas installée »
    const status = async (fresh = false) => { if (!st || fresh) { try { st = await api('td_tr_status'); stErr = ''; } catch (e) { st = null; stErr = e?.message || String(e); } } return st; };
    const ready = (s, k) => !!s?.langs?.[k]?.installed;

    /** installer une langue (et le moteur), en suivant l'avancement ; onStep(pct, texte) */
    async function install(k, onStep = () => {}) {
        const r = await post('td_tr_dl_start', {kind: k});
        if (r?.error) throw new Error(r.error);
        for (;;) {
            const s = await post('td_tr_dl_step', {id: r.id});
            if (s?.error) throw new Error(s.error);
            onStep(s.received, s.step || '');
            if (s.done) break;
        }
        await post('td_tr_pack_finish', {id: r.id});
        await status(true);
        return true;
    }
    async function translate(text, from) {
        const r = await post('td_tr_translate', {text, from});
        if (r?.error) throw new Error(r.error);
        return r;
    }
    const latinHelp = () => `<p class="ui-hint">${esc(T('Argos Translate n’a pas de modèle pour le latin. Pour un acte latin : « 🌐 Traduire » de l’atelier donne le mot à mot, et la traduction complète par le modèle d’IA installé sur cet ordinateur (« 🔬 Lecture approfondie », Ollama).'))}</p>`;

    /** le panneau de traduction (atelier, note, à la demande) : text, lang ; keep(t) facultatif */
    function panel(host, {text, lang, keep, close}) {
        const draw = async () => {
            if (!text.trim()) { host.innerHTML = `<p class="muted">${esc(T('Rien à traduire.'))}</p>`; return; }
            if (lang === 'la') { host.innerHTML = latinHelp(); return; }
            if (!LANGS[lang]) { host.innerHTML = `<p class="muted">${esc(T('Choisis la langue du texte : allemand, italien, espagnol, néerlandais, polonais, portugais ou anglais.'))}</p>`; return; }
            const s = await status();
            if (!s && stErr) { host.innerHTML = `<p class="error" role="alert">${esc(T('Impossible de vérifier si ces données sont installées : {e}', {e: stErr}))}</p>`; return; }
            if (!ready(s, lang)) {
                const mb = Math.round((s?.engine?.installed ? (lang === 'en' ? 1 : 2) * 95 : 450 + (lang === 'en' ? 1 : 2) * 95));
                host.innerHTML = `<p>${esc(T('La traduction {l} → français marche sans Internet une fois installée (≈ {n} Mo, une seule fois). Le texte ne quitte jamais l’ordinateur.', {l: langName(lang), n: String(mb)}))}</p>
                    <p><button type="button" class="button small" data-tdt-install>${esc(T('⤓ Installer la traduction {l} → français', {l: langName(lang)}))}</button></p><p class="muted" data-tdt-progress></p>
                    <small class="hist-src">${esc(T('Logiciel :'))} ${link('https://github.com/argosopentech/argos-translate', 'Argos Translate')} (${esc(T('MIT ou CC0'))}) · ${esc(T('modèles :'))} ${link('https://github.com/argosopentech/argospm-index', T('index d’Argos'))}</small>`;
                host.querySelector('[data-tdt-install]').onclick = async e => {
                    e.target.disabled = true; const pr = host.querySelector('[data-tdt-progress]');
                    try { await install(lang, (p, t) => { pr.textContent = `${t} (${p} %)`; }); A().toast?.(T('🌐 Traduction {l} → français installée.', {l: langName(lang)}), 'success'); draw(); }
                    catch (err) { pr.textContent = err.message; e.target.disabled = false; }
                };
                return;
            }
            host.innerHTML = `<p class="muted">${esc(T('Traduction en cours, sur cet ordinateur…'))}</p>`;
            try {
                const r = await translate(text, lang);
                if (!r.ok) { host.innerHTML = `<p class="muted">${esc(r.message || '')}</p>`; return; }
                const models = Object.entries(r.models || {}).map(([k, m]) => `${k}${m.licence ? ` — ${m.licence}` : ''}`).join(' ; ');
                host.innerHTML = `<textarea class="td-tr-out" rows="8" readonly>${esc(r.text)}</textarea>
                    <p class="td-tr-actions"><button type="button" class="button small secondary" data-tdt-copy>${esc(T('📋 Copier'))}</button>${keep ? ` <button type="button" class="button small secondary" data-tdt-keep>${esc(T('＋ Garder dans la transcription'))}</button>` : ''}${close ? ` <button type="button" class="button small secondary" data-tdt-close>${esc(T('✕ Fermer'))}</button>` : ''}</p>
                    <small class="hist-src">${esc(T('Traduit sur cet ordinateur par {e} ({r}). Traduction automatique : à relire, surtout les noms, les dates et les métiers.', {e: r.engine || 'Argos Translate', r: (r.route || []).join(' → ')}))}${models ? `<br>${esc(T('Modèles :'))} ${esc(models)}` : ''}</small>`;
                host.querySelector('[data-tdt-copy]').onclick = () => { navigator.clipboard?.writeText(r.text); A().toast?.(T('Copié.'), 'success'); };
                if (keep) host.querySelector('[data-tdt-keep]').onclick = () => keep(r.text);
            } catch (err) { host.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
            if (close) host.querySelector('[data-tdt-close]')?.addEventListener('click', close);
        };
        draw();
    }

    /* ─────────── 📜 l'atelier de transcription ─────────── */
    function wire(dlg) {
        dlg.querySelectorAll('[data-tx-cmd="aide"]').forEach(aide => {
            const after = aide.nextElementSibling?.matches?.('[data-pf-translate]') ? aide.nextElementSibling : aide;
            if (after.nextElementSibling?.matches?.('[data-td-translate]')) return;
            const b = document.createElement('button'); b.type = 'button'; b.dataset.tdTranslate = ''; b.textContent = `🌐 ${T('Traduire hors ligne')}`;
            b.title = T('Traduire la sélection (ou tout l’acte) en français, sur cet ordinateur');
            if (aide.className) b.className = aide.className;
            after.after(b);
        });
        const sync = () => { const l = langOfOcr(dlg.querySelector('[data-tx-lang]')?.value) || detect(dlg.querySelector('[data-tx-body]')?.value || ''); dlg.querySelectorAll('[data-td-translate]').forEach(b => { b.hidden = !LANGS[l] || !isOn(); }); };
        if (!dlg.dataset.tdTr) {
            dlg.dataset.tdTr = '1';
            dlg.addEventListener('change', e => { if (e.target.matches('[data-tx-lang]')) sync(); });
            dlg.addEventListener('input', e => { if (e.target.matches('[data-tx-body]')) { clearTimeout(sync.t); sync.t = setTimeout(sync, 400); } });
            dlg.addEventListener('click', e => { if (e.target.closest('[data-td-translate]')) toggle(dlg); });
        }
        sync();
    }
    function toggle(dlg) {
        const right = dlg.querySelector('.h-tx-right'); if (!right) return;
        const open = right.querySelector('.td-tr');
        const parts = right.querySelectorAll(':scope > .h-tx-chars, :scope > .h-tx-editor, :scope > .h-tx-found');
        const closeIt = () => { right.querySelector('.td-tr')?.remove(); parts.forEach(p => { p.hidden = false; }); };
        if (open) { closeIt(); return; }
        const area = dlg.querySelector('[data-tx-body]'), full = area?.value || '';
        const sel = area && area.selectionEnd > area.selectionStart ? full.slice(area.selectionStart, area.selectionEnd) : '';
        const lang = langOfOcr(dlg.querySelector('[data-tx-lang]')?.value) || detect(full);
        right.querySelector('.pf-tr')?.remove();
        parts.forEach(p => { p.hidden = true; });
        const box = document.createElement('section'); box.className = 'td-tr';
        box.innerHTML = `<h4>🌐 ${esc(T('Traduction hors ligne'))} <small class="muted">(${esc(langName(lang))} → ${esc(T('français'))}${sel ? `, ${esc(T('la sélection'))}` : ''})</small></h4><div data-tdt-body></div>`;
        right.appendChild(box);
        const tx = dlg.txApi;
        panel(box.querySelector('[data-tdt-body]'), {text: sel || full, lang, close: closeIt,
            keep: tx?.get ? t => { const cur = tx.get(), before = cur.data.translation || ''; cur.data.translation = before ? `${before}\n\n${t}` : t; tx.touch?.();
                A().undoToast?.(T('Traduction gardée dans la transcription (enregistre avec ⌘S)'), {undo: () => { cur.data.translation = before; tx.touch?.(); }, icon: '🌐'}); } : null});
    }
    new MutationObserver(() => document.querySelectorAll('dialog.h-tx-dlg').forEach(d => {
        if (!d.dataset.tdTr || [...d.querySelectorAll('[data-tx-cmd="aide"]')].some(x => !d.querySelector('[data-td-translate]'))) wire(d);
    })).observe(document.body || document.documentElement, {childList: true, subtree: true});

    /* ─────────── 📝 une note écrite dans une autre langue ─────────── */
    function openDialog(text, lang) {
        const dlg = document.createElement('dialog'); dlg.className = 'td-dlg';
        dlg.innerHTML = `<form method="dialog" class="td-dlg-head"><h3>🌐 ${esc(T('Traduction hors ligne'))}</h3><button class="icon-button" aria-label="${esc(T('Fermer'))}">✕</button></form>
            <p class="muted td-tr-src">${esc(text.slice(0, 600))}${text.length > 600 ? '…' : ''}</p><label>${esc(T('Langue du texte'))} <select data-tdt-lang>${['', ...Object.keys(LANGS), 'la'].map(k => `<option value="${k}" ${k === lang ? 'selected' : ''}>${esc(k ? (k === 'la' ? 'Latin' : T(LANGS[k])) : T('— à choisir —'))}</option>`).join('')}</select></label><div data-tdt-body></div>`;
        document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
        const go = () => panel(dlg.querySelector('[data-tdt-body]'), {text, lang: dlg.querySelector('[data-tdt-lang]').value});
        dlg.querySelector('[data-tdt-lang]').addEventListener('change', go); go();
        return dlg;
    }
    (ext.afterPerson = ext.afterPerson || []).push(() => {
        if (!isOn()) return;
        document.querySelectorAll('#workspace .note-item:not([data-tdt])').forEach(n => {
            n.dataset.tdt = '1';
            const body = n.querySelector(':scope > p')?.textContent || '', l = detect(body);
            if (!LANGS[l] && l !== 'la') return;
            const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-button small td-note-tr'; b.textContent = '🌐';
            b.title = T('Traduire cette note en français (sur cet ordinateur)'); b.setAttribute('aria-label', b.title);
            b.onclick = () => openDialog(body, l);
            (n.querySelector('.item-title-extra') || n.querySelector('.item-title-row') || n).appendChild(b);
        });
    });
    const isOn = () => { try { return (JSON.parse(localStorage.getItem('genealogie-telech-d') || '{}') || {}).traduire !== false; } catch (_) { return true; } };

    /* ─────────── ⚙️ l'installation (dans Réglages → 🧭 Mémoire et vieux papiers) ─────────── */
    async function settingsInto(host) {
        if (!host) return;
        const s = await status(true);
        if (!s) { host.innerHTML = stErr ? `<p class="error" role="alert">${esc(T('Impossible de vérifier si ces données sont installées : {e}', {e: stErr}))}</p>` : ''; return; }
        const S = s.sources || {};
        const rowL = ([k, l]) => { const L = s.langs?.[k]; return `<tr><td>${esc(T(l))} → ${esc(T('français'))}</td><td>${esc((L?.pairs || []).join(' + '))}</td><td>${L?.installed ? `✓ ${esc(L.built || '')}` : '—'}</td>
            <td>${L?.installed ? `<button type="button" class="button small secondary" data-tdt-undo="${k}">${esc(T('Retirer'))}</button>` : `<button type="button" class="button small" data-tdt-inst="${k}">${esc(T('⤓ Installer'))}</button>`}</td></tr>`; };
        const models = Object.entries(s.models || {});
        host.innerHTML = `<h3>${esc(T('🌐 Traduction hors ligne'))}</h3>
            <p class="muted">${esc(T('Traduire un acte ou une note en français sans Internet : le texte ne quitte jamais l’ordinateur. Moteur : Argos Translate (≈ 450 Mo une fois), puis ≈ 100 Mo par modèle ; les langues passent par l’anglais.'))}</p>
            ${s.install?.state === 'error' ? `<p class="ui-hint is-warn">${esc(s.install.step || '')}</p>` : ''}${s.install?.state === 'running' ? `<p class="muted">${esc(s.install.step || '')} (${esc(String(s.install.pct || 0))} %)</p>` : ''}
            <div class="cplus-scroll"><table class="data-table"><thead><tr><th>${esc(T('Langue'))}</th><th>${esc(T('Modèles'))}</th><th>${esc(T('Installé'))}</th><th></th></tr></thead><tbody>${Object.entries(LANGS).map(rowL).join('')}
                <tr><td>Latin → ${esc(T('français'))}</td><td colspan="3" class="muted">${esc(T('Pas de modèle latin dans Argos Translate (vérifié le 25 novembre 2026) : le mot à mot latin et l’IA locale de la lecture approfondie le font.'))}</td></tr></tbody></table></div>
            <p class="muted" data-tdt-set-progress></p>
            ${models.length ? `<details class="td-more"><summary>${esc(T('▸ Licence de chaque modèle (lue dans le paquet)'))}</summary><ul class="hist-ul td-ul">${models.map(([k, m]) => `<li><b>${esc(k)}</b> ${esc(m.version || '')} — ${esc(m.licence || T('pas de licence écrite dans le paquet'))}</li>`).join('')}</ul></details>` : ''}
            <small class="hist-src">${esc(T('Source :'))} ${['engine', 'models', 'opus'].map(k => S[k] ? `${link(S[k].url, S[k].label)} — ${esc(S[k].licence)} (« ${esc(S[k].quote)} », ${esc(T('lu le {d}', {d: S[k].read}))})` : '').filter(Boolean).join('<br>')}</small>
            ${s.engine?.installed ? `<p><button type="button" class="button small secondary" data-tdt-uninstall>${esc(T('🗑 Tout désinstaller'))}</button> <small class="muted">${esc(T('{n} Mo sur le disque', {n: String(Math.round((s.size || 0) / 1e6))}))}</small></p>` : ''}`;
    }
    document.addEventListener('click', async e => {
        const inst = e.target.closest?.('[data-tdt-inst]'), undo = e.target.closest?.('[data-tdt-undo]'), un = e.target.closest?.('[data-tdt-uninstall]');
        if (!inst && !undo && !un) return;
        const host = e.target.closest('[data-td-tr-panel]'), pr = host?.querySelector('[data-tdt-set-progress]');
        e.target.disabled = true;
        try {
            if (inst) { const k = inst.dataset.tdtInst; await install(k, (p, t) => { if (pr) pr.textContent = `${t} (${p} %)`; });
                A().undoToast?.(T('🌐 Traduction {l} → français installée.', {l: langName(k)}), {undo: async () => { await post('td_tr_pack_undo', {kind: k}); await settingsInto(host); }, icon: '🌐'}); }
            if (undo) { const k = undo.dataset.tdtUndo; await post('td_tr_pack_undo', {kind: k}); A().toast?.(T('Modèles retirés.'), 'success'); }
            if (un) { const ok = A().confirmBox ? await A().confirmBox(T('Le moteur et tous les modèles sont effacés (il faudra tout retélécharger).'), {title: T('Désinstaller la traduction hors ligne ?'), okLabel: T('Désinstaller')}) : true; if (ok) await post('td_tr_uninstall', {}); }
        } catch (err) { if (pr) pr.textContent = err.message; else A().toast?.(err.message, 'error'); }
        await status(true); await settingsInto(host);
    });

    /* ─────────── 🗂 Réglages → Données : une ligne par langue, dans la même file de téléchargements ─────────── */
    function registerFamily() {
        const F = ext.listesMaj?.families; if (!Array.isArray(F)) return false;
        if (F.some(f => f.id === 'td_tr')) return true;
        F.push({id: 'td_tr', icon: '🌐', theme: 'Outils installés', tab: 'telech_d', status: 'td_tr_status', info: 'td_tr_dl_info', pre: 'td_tr', finish: 'td_tr_pack_finish', body: k => ({kind: k}),
            source: 'Argos Translate (Argos Open Technologies) ; modèles de l’index d’Argos', licence: 'MIT ou CC0 (logiciel) ; licence écrite dans chaque modèle', url: 'https://github.com/argosopentech/argos-translate',
            installed: (s, k) => !!s?.langs?.[k]?.installed, built: (s, k) => s?.langs?.[k]?.built || '', size: (s, k) => s?.langs?.[k]?.size || 0, removable: () => false, online: (i, k) => i?.packs?.[k],
            // seulement les langues déjà installées (l'installation se fait depuis l'atelier ou Réglages → 🧭 Mémoire et vieux papiers) : pas de lignes vides ici
            itemsOf: st => Object.entries(LANGS).filter(([k]) => st?.langs?.[k]?.installed).map(([k, l]) => ({k, name: `Traduction ${l.toLowerCase()} → français`, what: 'Sur cet ordinateur, sans Internet (Argos Translate)', approx: (k === 'en' ? 1 : 2) * 95e6}))});
        return true;
    }
    if (!registerFamily()) { const t = setInterval(() => { if (registerFamily()) clearInterval(t); }, 1000); setTimeout(() => clearInterval(t), 30000); }

    /* ─────────── 🧰 à la demande : traduire un texte ─────────── */
    (ext.dataSources = ext.dataSources || []).push({id: 'td_traduire', icon: '🌐', label: T('Traduire un texte (hors ligne)'), group: 'Chercher', needs: [], installed: () => true,
        run: async (ctx, host) => {
            host.innerHTML = `<div class="td-tr-free"><textarea rows="5" data-tdt-in placeholder="${esc(T('Colle ici un texte en allemand, italien, espagnol, néerlandais, polonais, portugais ou anglais'))}" aria-label="${esc(T('Texte à traduire'))}"></textarea>
                <p><select data-tdt-lang aria-label="${esc(T('Langue du texte'))}"><option value="">${esc(T('Langue : reconnue toute seule'))}</option>${Object.entries(LANGS).map(([k, l]) => `<option value="${k}">${esc(T(l))}</option>`).join('')}<option value="la">Latin</option></select>
                <button type="button" class="button small" data-tdt-go>${esc(T('🌐 Traduire'))}</button></p><div data-tdt-body></div></div>`;
            host.querySelector('[data-tdt-go]').onclick = () => { const t = host.querySelector('[data-tdt-in]').value; panel(host.querySelector('[data-tdt-body]'), {text: t, lang: host.querySelector('[data-tdt-lang]').value || detect(t)}); };
            return true;
        }});

    ext.telechTraduire = {...core, translate, status, install, settingsInto, openDialog, panel};
})(typeof window !== 'undefined' ? window : globalThis);
