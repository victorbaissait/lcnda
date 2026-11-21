/* LCNDA — ⚖️ Successoral, quinze outils de plus (maquette validée docs/design/successoral-plus-2.html) : écrans, partie 1.
 * ⚰️ Vérifier les décès (fichier INSEE déjà importé) · 📋 Questionnaire · 📞 Échanges · 📮 Recommandés · 🗺 Carte des héritiers ·
 * 🔗 Double preuve · 🗓 Dates importantes · 👥 Fusion · 🕵️ Recherches par héritier · 📦 Archive chiffrée ; idées : 🔗 dossier lié,
 * 📮 une lettre par service, ⏳ délai par organisme, 📅 date de délivrance, 🙈 écran partagé ; réglages de tous les outils.
 * Partie 2 (heritage-successoral-plus2b.js) : 🧾 factures, 💶 fonds, 📈 activité, 📝 contrat, 🤝 copie pour le notaire.
 * Calculs sans écran : heritage-successoral-plus2-core.js ; serveur : lib/successoral_plus2.php ; essais : tests/test-successoral-plus2*.js.
 * Règle : l'app range, compare, rappelle et met en page ; elle ne décide jamais (aucun héritier déclaré mort sans un clic, aucun
 * texte juridique écrit, aucun délai légal calculé, aucun service extérieur interrogé). Rien en mode consultation ni simple.
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP, UI = () => window.LCNDA_UI, P = () => window.LCNDA_PICKER || window.LCNDA_APP, S = () => window.LCNDA_SUCC_CORE, OC = () => window.LCNDA_SUCC_OUTILS, C = () => window.LCNDA_SUCC_P2;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const SP = ext.succPlus2 = ext.succPlus2 || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const plural = (n, w, many) => (A()?.plural ? A().plural(n, w, many) : `${n} ${w}`);
    const get = (op, q = {}) => A().api('successoral', {op, ...q});
    const post = async body => { const r = await A().api('successoral_write', {}, {method: 'POST', body}); try { window.dispatchEvent(new CustomEvent('lcnda:succ-changed', {detail: {op: body?.op}})); } catch (_) {} return r.result || r; };
    const toast = (...a) => A().toast(...a);
    const hidden = () => document.body?.classList.contains('is-kiosk') || document.documentElement.classList.contains('ms-open');
    const badge = (t, k = 'grey', o) => (UI()?.badge ? UI().badge(t, k, o) : `<span class="ui-badge is-${k}">${esc(t)}</span>`);
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const nowLocal = () => { const d = new Date(); return `${today()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const fmtDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(iso || ''); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)); try { return window.LCNDA_I18N?.fmtDate ? window.LCNDA_I18N.fmtDate(d, {day: 'numeric', month: 'short', year: 'numeric'}) : d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}); } catch (_) { return iso; } };
    const ymd = s => { const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})$/); return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s || ''); };
    const daysTo = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null; const t = new Date(); return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5); };
    const seps = () => { const s = window.LCNDA_I18N?.fmtNumber ? window.LCNDA_I18N.fmtNumber(12345.5, {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '12 345,5'; const m = s.match(/^12(\D*)345(\D)5$/); return m ? [m[1], m[2]] : [' ', ',']; };
    const money = c => `${C().money(c, ...seps())} €`;
    const nameOf = (D, id) => S().name(D.graph?.persons?.[id] || D.p2?.second?.graph?.persons?.[id]);
    const dl = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const reload = () => ext.successoral?.reload?.();
    const cur = () => ext.successoral?.current?.();
    const seg = (name, opts, val) => `<div class="segmented sp2-seg" role="radiogroup">${opts.map(([v, l]) => `<label class="${String(v) === String(val) ? 'is-active' : ''}"><input type="radio" name="${esc(name)}" value="${esc(v)}"${String(v) === String(val) ? ' checked' : ''}> ${esc(i18n(l))}</label>`).join('')}</div>`;
    const ck = (label, attrs = '', on = false, sub = '') => (UI()?.checkHtml ? UI().checkHtml(label, {checked: on, attrs, sub}) : `<label class="checkbox-line"><input type="checkbox" ${attrs}${on ? ' checked' : ''}> ${esc(label)}</label>`);
    const setLink = key => `<button type="button" class="link-button sp2-setlink" data-sp2-setlink="${esc(key)}" title="${esc(i18n('Réglages de cet outil'))}">⚙️ ${esc(i18n('Réglages de cet outil'))}</button>`;
    SP.h = {esc, i18n, plural, get, post, toast, badge, today, fmtDate, daysTo, money, nameOf, dl, reload, cur, seg, ck, setLink, hidden};

    /* ═════ Les réglages (successoral.json, « p2 » et « cabinet ») ═════ */
    let SET = null;
    const cfg = () => C().settings(SET?.p2);
    SP.cfg = cfg; SP.cabinet = () => SET?.cabinet || {};
    SP.siret = () => SET?.cabinet?.siret || '';
    SP.protected = () => !!SET?.protected; // 🔐 généalogie protégée par un mot de passe : archive et copie pour le notaire toujours chiffrées
    async function loadSettings(force = false) {
        if (SET && !force) return SET;
        try { SET = await get('p2_settings'); } catch (_) { SET = SET || {p2: {}, cabinet: {}}; }
        return SET;
    }
    SP.loadSettings = loadSettings;
    const optLabel = (it, v) => { const o = (it.options || []).find(x => String(x[0]) === String(v)); return o ? i18n(o[1]) : String(v); };
    SP.settingsHtml = st => {
        if (st?.p2) SET = {...(SET || {}), p2: st.p2, cabinet: st.cabinet || SET?.cabinet || {}};
        const s = cfg();
        const row = it => {
            const v = s[it.key];
            let ctl;
            if (it.text) ctl = `<input type="url" maxlength="300" value="${esc(v)}" data-sp2-set="${it.key}" data-sp2-text aria-label="${esc(i18n(it.help))}">`;
            else if (it.prefix) ctl = `<input maxlength="6" value="${esc(v)}" data-sp2-set="${it.key}" data-sp2-text class="sp2-prefix" aria-label="${esc(i18n(it.help))}">`;
            else {
                const known = it.options.some(o => String(o[0]) === String(v));
                ctl = it.options.map(([ov, ol]) => `<label class="succ-radio"><input type="radio" name="sp2-set-${it.key}" value="${esc(ov)}" data-sp2-set="${it.key}"${String(ov) === String(v) ? ' checked' : ''}> ${esc(i18n(ol))}${String(ov) === String(it.def) ? ` <small class="muted">${esc(i18n('(conseillé)'))}</small>` : ''}</label>`).join('')
                    + (it.custom ? `<label class="succ-radio sp2-custom"><input type="radio" name="sp2-set-${it.key}" value="__custom" data-sp2-set="${it.key}"${known ? '' : ' checked'}> ${esc(i18n('Autre :'))} <input type="number" min="${it.custom[0]}" max="${it.custom[1]}" value="${known ? '' : esc(v)}" data-sp2-custom="${it.key}" aria-label="${esc(i18n('Autre :'))}"></label>` : '');
            }
            return `<div class="sp2-set-row" data-sp2-row="${it.key}"><div class="sp2-set-ctl">${ctl}</div><p class="ui-hint">${esc(i18n(it.help))}</p></div>`;
        };
        return `<div class="sp2-settings" id="sp2-reglages"><h4>⚖️ ${esc(i18n('Outils du dossier : réglages'))}</h4><p class="muted">${esc(i18n('Chaque choix se change ici ; l’option conseillée est celle du départ.'))}</p>
            ${C().SPEC.map((g, gi) => `<details class="sp2-set-group" id="sp2-g${gi}"${gi < 2 ? ' open' : ''}><summary><b>${esc(i18n(g.tool))}</b></summary>${g.items.map(row).join('')}</details>`).join('')}
            ${SP.cabinetHtml ? SP.cabinetHtml(SET?.cabinet || {}) : ''}</div>`;
    };
    async function saveSetting(patch, label, key = 'p2') {
        const prev = key === 'p2' ? {...cfg()} : {...(SET?.cabinet || {})};
        let r; try { r = await post({op: 'settings_save', settings: {[key]: patch}}); } catch (e) { toast(e.message, 'error'); return false; }
        SET = {...(SET || {}), p2: r.settings.p2, cabinet: r.settings.cabinet};
        const back = Object.fromEntries(Object.keys(patch).map(k => [k, prev[k]]));
        A().undoToast(i18n('Réglage enregistré : {what}', {what: label}), {undo: async () => { const r2 = await post({op: 'settings_save', settings: {[key]: back}}); SET = {...SET, p2: r2.settings.p2, cabinet: r2.settings.cabinet}; ext.succDossiers?.refreshSettings?.(); ext.successoral?.forget?.(); }});
        ext.successoral?.forget?.();
        ext.succDossiers?.refreshSettings?.();
    }
    SP.saveSetting = saveSetting;
    document.addEventListener('change', e => {
        const t = e.target; if (!t.closest?.('#sp2-reglages')) return;
        const cust = t.closest('[data-sp2-custom]');
        const key = t.dataset.sp2Set || cust?.dataset.sp2Custom; if (!key) return;
        const it = C().SPEC.flatMap(g => g.items).find(x => x.key === key); if (!it) return;
        let v = t.value;
        if (cust || v === '__custom') { const n = Number((cust || t.closest('.sp2-custom').querySelector('[data-sp2-custom]')).value); if (!Number.isInteger(n) || n < it.custom[0] || n > it.custom[1]) return; v = n; }
        else if (typeof it.def === 'number') v = Number(v);
        if (t.dataset.sp2Text !== undefined && it.text && v && !C().trackUrl(v, '1')) return toast(i18n('Adresse refusée : https:// et {numero} sont obligatoires.'), 'error');
        const was = cfg()[key];
        const restore = () => { if (it.prefix || it.text) t.value = String(was ?? ''); else { const o = document.querySelector(`#sp2-reglages [name="sp2-set-${key}"][value="${CSS.escape(String(was))}"]`) || document.querySelector(`#sp2-reglages [name="sp2-set-${key}"][value="__custom"]`); if (o) o.checked = true; } };
        if (it.prefix) {
            v = String(v).trim().toUpperCase();
            // 🧾 factures, avoirs et devis : trois préfixes différents (sinon l'avoir prendrait un numéro de facture et ne serait pas émis)
            if (['inv_prefix_f', 'inv_prefix_a', 'inv_prefix_d'].some(k => k !== key && String(cfg()[k]) === v)) { restore(); return toast(i18n('Ce préfixe est déjà celui des factures, des avoirs ou des devis : choisis-en un autre (les trois doivent être différents).'), 'error'); }
            if (!/^[A-Z0-9]{1,6}$/.test(v)) { restore(); return toast(i18n('Préfixe refusé : de 1 à 6 lettres ou chiffres, sans accent.'), 'error'); }
        }
        saveSetting({[key]: v}, `${i18n(it.help).split(/[.:]/)[0]} → ${it.options ? optLabel(it, v) : v}`).then(ok => { if (ok === false) restore(); });
    });
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-sp2-setlink]'); if (!b) return;
        e.preventDefault(); b.closest('dialog')?.close?.();
        const gi = C().SPEC.findIndex(g => g.items.some(i => i.key === b.dataset.sp2Setlink));
        ext.succDossiers?.openSetting?.(gi >= 0 ? `sp2-g${gi}` : 'sp2-reglages');
        setTimeout(() => { const d = document.getElementById(`sp2-g${gi}`); if (d) d.open = true; }, 400);
    });

    /* ═════ Les onglets et les vues ═════ */
    SP.tabs = T0 => {
        if (cfg().calls_place !== 'tab') return T0;
        const i = T0.findIndex(t => t[0] === 'contacts');
        return [...T0.slice(0, i + 1), ['calls', '📞 Échanges'], ...T0.slice(i + 1)];
    };
    SP.views = V0 => [...V0, ['activite', '📈 Activité']];
    SP.view = (k, body, token) => (k === 'activite' && SP.activity ? SP.activity(body, token) : null);
    SP.boardMore = () => [`<button type="button" data-sp2-map="0">🗺 ${esc(i18n('Carte des héritiers (dossiers en cours)'))}</button>`, `<button type="button" data-sp2-delays>⏳ ${esc(i18n('Délai de réponse par organisme'))}</button>`, ...(SP.boardMoreB?.() || [])];
    SP.caseMore = D => [`<button type="button" class="sp2-share-btn" data-sp2-share aria-pressed="${shareOn()}">${esc(i18n('🙈 Écran partagé'))}${shareOn() ? ' ✓' : ''}</button>`, // dans ⋯ : l'en-tête garde « ⚖️ Un doute ? » visible
        ...(!['clos', 'archive'].includes(D.state) ? [`<button type="button" data-sp2-merge>👥 ${esc(i18n('Fusionner avec un autre dossier…'))}</button>`] : []),
        ...(D.p2?.merges?.length ? [`<button type="button" data-sp2-merge-undo>↶ ${esc(i18n('Annuler la dernière fusion'))}</button>`] : []),
        ...(SP.caseMoreB?.(D) || [])];
    /** 👥 le journal d'un dossier fusionné, mis bout à bout, chaque ligne marquée de son dossier */
    SP.prepare = D => {
        if (!D?.p2 || D._p2prep) return; D._p2prep = true;
        const m = D.p2.merged_journal || []; if (!m.length) return;
        D.journal = [...D.journal.map(j => ({...j, text: `[${D.number}] ${j.text}`})), ...m.map(j => ({...j, text: `[${j.from}] ${j.text}`}))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    };
    SP.tab = (k, body, D, R, P_) => { if (k === 'calls') callsTab(body, D, R); };
    const after = (body, html, key) => { const box = document.createElement('div'); box.className = 'sp2-after'; box.dataset.sp2After = key; box.innerHTML = html; body.after(box); return box; };
    SP.after = (tab, body, D, R, P_) => {
        if (!D || hidden()) return;
        const ro = D.archived || D.state === 'archive';
        if (tab === 'dossier') dossierExtra(body, D, ro);
        if (tab === 'heirs' && R && !R.error) heirsExtra(body, D, R, ro);
        if (tab === 'contacts' && R && !R.error) contactsExtra(body, D, R, ro);
        if (tab === 'pieces' && P_) piecesExtra(body, D, R, P_, ro);
        if (tab === 'notary') notaryExtra(body, D, R, P_);
        SP.afterB?.(tab, body, D, R, P_, ro, after);
        if (shareOn()) maskPage();
    };

    /* ═════ 1. ⚰️ Vérifier si un héritier est décédé ═════ */
    const CRIT = {name: 'nom', first: 'prénoms', birth: 'naissance', place: 'lieu', sex: 'sexe'};
    const critHtml = p => {
        const d = p.detail || {}, out = [];
        out.push(`${d.name >= 1 ? '✓' : d.name > 0 ? '≈' : '✕'} ${esc(i18n('nom de naissance'))}`);
        out.push(`${d.first >= 1 ? '✓' : d.first > 0 ? '≈' : '✕'} ${esc(i18n('prénom'))}`);
        out.push({day: `✓ ${esc(i18n('né(e) le {d}', {d: fmtDate(ymd(p.naissance))}))}`, month: `≈ ${esc(i18n('même mois'))}`, year: `≈ ${esc(i18n('même année'))}`, near: `≈ ${esc(i18n('± 1 an'))}`, unknown: `? ${esc(i18n('date inconnue'))}`, diff: `✕ ${esc(i18n('date de naissance différente'))}`}[d.birth] || '');
        out.push(d.place >= 1 ? `✓ ${esc(p.lieu_naissance || i18n('lieu'))}` : d.place > 0 ? `≈ ${esc(i18n('même département'))}` : d.place === -1 ? `? ${esc(i18n('lieu inconnu sur la fiche'))}` : `✕ ${esc(i18n('lieu : {p}', {p: p.lieu_naissance || '—'}))}`);
        return `<p class="sp2-crit">${out.filter(Boolean).map(x => `<span>${x}</span>`).join('')}</p>`;
    };
    async function inseeDialog(D) {
        let r; try { r = await post({op: 'p2_insee_check', case_id: D.id}); } catch (e) { return toast(e.message, 'error'); }
        const death = D.death_iso || '';
        if (!r.stats?.rows) {
            return ext.openDialog({eyebrow: '⚰️', title: i18n('Le fichier des décès n’est pas dans l’app.'), submitLabel: i18n('⤒ Importer les décès'),
                body: `<p>${esc(i18n('L’import se fait une seule fois, depuis data.gouv.fr (environ 25 millions de lignes depuis 1970), ou par années choisies.'))}</p>`,
                onSubmit: () => { A().state.researchKind = 'insee'; A().setModule('recherche'); }});
        }
        const s = r.stats, set = cfg();
        const cover = `${esc(i18n('fichier importé : décès {a} → {b}', {a: String(s.from), b: String(s.to)}))}${s.from > 1975 ? ` · ${esc(i18n('un décès plus ancien ne peut pas être trouvé'))}` : ''}`;
        // « avant » / « après » le défunt seulement si les deux dates sont complètes et différentes (même règle que succ_p2_insee_status)
        const inseeStatus = p => p.status || (/^\d{4}-\d{2}-\d{2}$/.test(p.deces || '') && /^\d{4}-\d{2}-\d{2}$/.test(death) && p.deces !== death ? (p.deces < death ? 'dead_before' : 'dead_after') : 'unknown');
        const one = (h, p) => {
            const st = inseeStatus(p);
            return `<div class="sp2-piste${p.score >= 80 ? ' is-strong' : ''}" data-sp2-piste="${h.person_id}:${p.insee_id}"><div class="sp2-piste-head"><b>${esc(p.prenoms)} ${esc(p.nom)}</b> ${badge(`${p.score} / 100`, p.score >= 80 ? 'red' : p.score >= 60 ? 'yellow' : 'grey')}
                ${p.cap < 100 ? `<small class="muted">${esc(i18n('plafonné à {n}', {n: p.cap}))}</small>` : ''}</div>${critHtml(p)}
                <p>† ${esc(fmtDate(p.deces))}${p.lieu_deces ? ', ' + esc(p.lieu_deces) : ''}${p.acte ? ' · ' + esc(i18n('acte n° {n}', {n: p.acte})) : ''} · ${esc(st === 'dead_before' ? i18n('avant le défunt : si c’est cette personne, ses enfants viennent à sa place (représentation).') : st === 'dead_after' ? i18n('après le défunt : sa part passe à ses propres héritiers.') : i18n('le même jour que le défunt, ou une date incomplète : l’ordre des décès n’est pas connu ; le statut reste « Inconnu », à vérifier sur les actes.'))}</p>
                ${p.detail?.abroad ? `<p class="ui-hint">${esc(i18n('Les Français nés à l’étranger ont leur acte au Service central d’état civil (Nantes).'))}</p>` : ''}
                ${p.same ? badge(i18n('déjà confirmé'), 'green') : D.archived ? '' : `<div class="succ-acts"><button type="button" class="button small" data-sp2-insee-yes="${h.person_id}:${p.insee_id}:${p.score}">✓ ${esc(i18n('C’est cette personne'))}</button><button type="button" class="button small secondary" data-sp2-insee-no="${h.person_id}:${p.insee_id}:${p.score}">✕ ${esc(i18n('Pas la même personne'))}</button><button type="button" class="button small secondary" data-sp2-insee-later>${esc(i18n('Plus tard'))}</button></div>`}</div>`;
        };
        const heirHtml = h => `<section class="succ-box sp2-insee-heir"><h4>${esc(h.name)} <small class="muted">${esc([h.birth, h.birth_place].filter(Boolean).join(', '))}</small></h4>
            ${h.married_only ? UI().notice('warn', i18n('Nom de naissance inconnu : cherché sous {n}, pistes moins sûres', {n: h.birth_name})) : ''}
            ${h.twins ? UI().notice('warn', i18n('Deux personnes se ressemblent : demande l’acte avant de choisir')) : ''}
            ${h.pistes.length ? h.pistes.map(p => one(h, p)).join('') : `<p>${badge(i18n('rien trouvé dans le fichier'), 'grey')} <small class="muted">${esc(i18n('« Rien trouvé » ne veut pas dire « vivant » (un décès à l’étranger manque souvent).'))}</small></p>`}</section>`;
        const dismissed = (D.p2?.insee_dismissed || []);
        ext.openDialog({eyebrow: `⚰️ ${D.number}`, title: i18n('Les héritiers « vivants » comparés au fichier des décès'), wide: true, submitLabel: i18n('Fermer'),
            body: `<p class="muted">${cover} · ${esc(i18n('pistes à partir de {n}', {n: set.insee_threshold}))} ${setLink('insee_threshold')}</p>
                ${r.heirs.length ? r.heirs.map(heirHtml).join('') : `<p>${esc(i18n('Aucun héritier « vivant » à vérifier dans ce dossier.'))}</p>`}
                <details class="sp2-how"><summary>ⓘ ${esc(i18n('Comment c’est calculé'))}</summary><table class="succ-table"><tbody>
                <tr><th>${esc(i18n('Nom'))}</th><td>25</td><td>${esc(i18n('Le nom de naissance, sans accents ni tirets ; jamais le nom d’épouse (l’INSEE donne le nom de naissance).'))}</td></tr>
                <tr><th>${esc(i18n('Prénoms'))}</th><td>20</td><td>${esc(i18n('Le premier prénom de la fiche parmi les prénoms INSEE ; Jean-Pierre = Jean Pierre.'))}</td></tr>
                <tr><th>${esc(i18n('Date de naissance'))}</th><td>30</td><td>${esc(i18n('Jour exact 30 · même mois 20 · même année 12 · ± 1 an 6 ; sans date : plafond 70.'))}</td></tr>
                <tr><th>${esc(i18n('Lieu de naissance'))}</th><td>20</td><td>${esc(i18n('La commune ; même département 10 ; né à l’étranger : le pays (plafond 80).'))}</td></tr>
                <tr><th>${esc(i18n('Sexe'))}</th><td>5</td><td>${esc(i18n('Différent : la piste est écartée.'))}</td></tr></tbody></table></details>
                ${dismissed.length ? `<details class="sp2-how"><summary>${esc(i18n('Pistes écartées ({n})', {n: dismissed.length}))}</summary><ul>${dismissed.map(x => `<li>${esc(nameOf(D, x.person_id))} · ${esc(x.what)} <button type="button" class="link-button" data-sp2-insee-undo="${x.id}">↶ ${esc(i18n('Annuler'))}</button></li>`).join('')}</ul></details>` : ''}`,
            onOpen: d => d.addEventListener('click', async e => {
                const yes = e.target.closest('[data-sp2-insee-yes]'), no = e.target.closest('[data-sp2-insee-no]'), un = e.target.closest('[data-sp2-insee-undo]');
                if (e.target.closest('[data-sp2-insee-later]')) { e.target.closest('.sp2-piste')?.classList.add('is-later'); return; }
                if (un) { try { await post({op: 'p2_insee_undo', case_id: D.id, check_id: Number(un.dataset.sp2InseeUndo)}); } catch (err) { return toast(err.message, 'error'); } un.closest('li')?.remove(); toast(i18n('Piste remise')); return; }
                if (no) {
                    const [pid, iid, sc] = no.dataset.sp2InseeNo.split(':').map(Number);
                    let x; try { x = await post({op: 'p2_insee_not_same', case_id: D.id, person_id: pid, insee_id: iid, score: sc}); } catch (err) { return toast(err.message, 'error'); }
                    no.closest('.sp2-piste')?.remove();
                    A().undoToast(i18n('« Pas la même personne » retenu : cette piste ne reviendra plus'), {undo: async () => { await post({op: 'p2_insee_undo', case_id: D.id, check_id: x.check_id}); reload(); }});
                    return;
                }
                if (yes) {
                    const [pid, iid, sc] = yes.dataset.sp2InseeYes.split(':').map(Number);
                    const h = r.heirs.find(x => x.person_id === pid), p = h?.pistes.find(x => x.insee_id === iid); if (!p) return;
                    const st = inseeStatus(p), mode = cfg().insee_write;
                    const ok = await A().confirmBox(`${mode === 'both' ? (/^\d{4}-\d{2}-\d{2}$/.test(p.deces || '') ? i18n('Sur la fiche de {n} : un décès le {d}, source « Fichier des personnes décédées (INSEE) », avec la date du relevé.', {n: h.name, d: fmtDate(p.deces)}) : i18n('Sur la fiche de {n} : un décès en {d} (date incomplète dans le fichier), source « Fichier des personnes décédées (INSEE) », avec la date du relevé.', {n: h.name, d: p.deces})) + ' ' : ''}${i18n('Dans ce dossier : statut retenu « {s} » ; le calcul est refait.', {s: i18n(st === 'dead_before' ? 'Mort avant le défunt' : st === 'dead_after' ? 'Mort après le défunt' : 'Inconnu')})}`, {title: i18n('Ce qui va changer'), okLabel: i18n('Noter')});
                    if (!ok) return;
                    let x; try { x = await post({op: 'p2_insee_confirm', case_id: D.id, person_id: pid, insee_id: iid, score: sc}); } catch (err) { return toast(err.message, 'error'); }
                    d.close();
                    A().undoToast(i18n('{n} marqué(e) décédé(e) (INSEE). Calcul refait.', {n: h.name}), {undo: async () => { await post({op: 'p2_insee_undo', case_id: D.id, check_id: x.check_id}); reload(); }});
                    reload();
                }
            })});
    }
    SP.inseeDialog = inseeDialog;

    /* ═════ 👥 Héritiers : ⚰️, 🗺, 🕵️, 📞, 🔗 dossier lié, deuxième défunt ═════ */
    function heirsExtra(body, D, R, ro) {
        const box = body.querySelector('.succ-heirs')?.closest('.succ-box');
        const acts = box?.querySelector('.succ-acts');
        if (acts && !ro) acts.insertAdjacentHTML('afterbegin', `<button type="button" class="button small" data-sp2-insee>⚰️ ${esc(i18n('Vérifier les décès'))}</button><button type="button" class="button small secondary" data-sp2-map="${D.id}">🗺 ${esc(i18n('Voir sur la carte'))}</button><button type="button" class="button small secondary" data-sp2-q>📋 ${esc(i18n('Questionnaire…'))}</button>`);
        const last = D.p2?.insee_last || {};
        const calls = D.p2?.calls || [];
        body.querySelectorAll('tr[data-succ-pid]').forEach(tr => {
            const pid = Number(tr.dataset.succPid), td = tr.firstElementChild; if (!td) return;
            const row = R.rows.find(r => r.id === pid); if (!row || row.role === 'out') return;
            const bits = [];
            const l = last[pid]; if (l && ['surv'].includes(row.timing)) bits.push(badge(l.n ? i18n('⚰️ INSEE : {n} piste(s)', {n: l.n}) : i18n('⚰️ vérifié le {d}', {d: fmtDate(String(l.at).slice(0, 10))}), l.n ? 'yellow' : 'green'));
            bits.push(`<button type="button" class="link-button sp2-mini" data-sp2-research="${pid}" title="${esc(i18n('🕵️ Recherches'))}">🕵️</button>`);
            if (!ro) bits.push(`<button type="button" class="link-button sp2-mini" data-sp2-call-for="${pid}" title="${esc(i18n('📞 Noter un échange'))}">📞</button>`);
            const lc = calls.find(c => c.person_id === pid);
            if (lc) bits.push(`<small class="muted sp2-lastcall">📞 ${esc(fmtDate(lc.at.slice(0, 10)))} · ${esc(lc.summary.slice(0, 60))}</small>`);
            if ((D.overrides?.[pid]?.status === 'dead_after' || row.timing === 'post') && !ro) bits.push(`<button type="button" class="link-button sp2-mini" data-sp2-link-case="${pid}">🔗 ${esc(i18n('Ouvrir un dossier lié'))}</button>`);
            td.insertAdjacentHTML('beforeend', `<div class="sp2-heir-bits">${bits.join(' ')}</div>`);
        });
        let html = '';
        if (cfg().calls_place === 'heirs') html += `<section class="succ-box" data-sp2-calls-inline></section>`;
        if (D.p2?.linked?.length) html += `<section class="succ-box"><h3>🔗 ${esc(i18n('Dossiers liés'))}</h3><p>${D.p2.linked.map(l => `<button type="button" class="table-link" data-succ-open="${l.id}">${esc(l.number)} · ${esc(l.title)}</button>`).join(' · ')}</p></section>`;
        if (D.p2?.second) html += secondHtml(D);
        if (html) { const b = after(body, html, 'heirs'); const ci = b.querySelector('[data-sp2-calls-inline]'); if (ci) callsTab(ci, D, R); }
    }
    /** 👥 deux défunts dans un dossier : le deuxième calcul, à côté, jamais mélangé */
    function secondHtml(D) {
        const s = D.p2.second;
        let R2 = null;
        try {
            const statuses = {}; for (const [pid, o] of Object.entries(s.overrides || {})) if (o.status) statuses[pid] = {status: o.status};
            R2 = S().compute(s.graph, {deceasedId: s.deceased_id, deathDate: s.death_iso || '', deathText: s.death_date_text, overrides: statuses, t: i18n});
        } catch (_) {}
        const rows = R2 && !R2.error ? R2.rows.filter(r => r.role !== 'out' && r.share !== '0') : [];
        return `<section class="succ-box sp2-second"><h3>👥 ${esc(i18n('Succession de {n}', {n: s.name}))} <small class="muted">${esc(i18n('dossier d’origine {n}', {n: s.number}))}</small></h3>
            ${UI().notice('info', i18n('Deux défunts, deux calculs : les successions restent distinctes.'))}
            ${rows.length ? `<div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('Personne'))}</th><th>${esc(i18n('Lien avec le défunt'))}</th><th>${esc(i18n('Part'))}</th></tr></thead><tbody>${rows.map(r => `<tr><td><button type="button" class="table-link" data-h-person="${r.id}">${esc(r.name)}</button></td><td>${esc(r.kin)}</td><td><b>${esc(r.share)}</b></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(R2?.error || i18n('Aucun héritier trouvé d’après les fiches.'))}</p>`}</section>`;
    }

    /* ═════ 3. 📞 Journal des appels et échanges ═════ */
    const MEANS = [['phone', '📞', 'Téléphone'], ['mail', '✉️', 'Courriel'], ['visit', '🚪', 'Visite'], ['post', '📮', 'Courrier'], ['other', '💬', 'Autre']];
    const meanIco = m => (MEANS.find(x => x[0] === m) || MEANS[4])[1];
    function callsTab(body, D, R) {
        const ro = D.archived;
        const calls = D.p2?.calls || [];
        const mail = cfg().calls_mail === 'grey' ? (D.courriers || []).map(c => ({mail: true, id: c.id, at: c.date_envoi, person_id: c.person_id, who: c.destinataire, means: 'post', summary: c.objet})) : [];
        const people = [...new Map([...calls, ...mail].filter(x => x.person_id).map(x => [x.person_id, nameOf(D, x.person_id) || x.who])).entries()];
        body.innerHTML = `<div class="succ-box-head"><h3>📞 ${esc(i18n('Échanges'))}</h3><div class="succ-acts">${ro ? '' : `<button type="button" class="button small" data-sp2-call-new>＋ ${esc(i18n('Noter un échange'))}</button>`}${setLink('calls_place')}</div></div><div data-sp2-calls></div>
            ${mail.length ? `<p class="ui-hint">${esc(i18n('Les courriers du Registre ne sont pas recopiés ici : ils sont montrés en gris, en lecture.'))}</p>` : ''}`;
        const all = [...calls, ...mail].sort((a, b) => String(b.at).localeCompare(String(a.at)));
        const bar = UI().listBar({key: 'succ:p2calls', search: {placeholder: i18n('Chercher… (personne, résumé)')},
            filters: [{id: 'who', label: i18n('Avec'), type: 'select', options: [['', i18n('Tout le monde')], ...people.map(([id, n]) => [String(id), n])]}, {id: 'means', label: i18n('Moyen'), type: 'check', options: MEANS.map(([k, ic, l]) => [k, `${ic} ${i18n(l)}`])}],
            sort: {options: [['recent', i18n('Les plus récents')], ['old', i18n('Les plus anciens')]], value: 'recent'}, onChange: st => draw(st)});
        const box = body.querySelector('[data-sp2-calls]'); box.before(bar);
        const M = UI().listMatch;
        function draw(st = bar.state) {
            let list = all.filter(x => M.text(st.q, x.who, x.summary, x.next, nameOf(D, x.person_id)) && (!st.filters.who || String(x.person_id) === String(st.filters.who)) && (!st.filters.means?.length || st.filters.means.includes(x.means)));
            if (st.sort === 'old') list = [...list].reverse();
            bar.setCount(list.length, 'échange noté', 'échanges notés');
            box.innerHTML = list.length ? `<ul class="sp2-calls">${list.map(x => `<li class="${x.mail ? 'is-mail' : ''}"><div class="sp2-call-when"><b>${esc(fmtDate(String(x.at).slice(0, 10)))}</b>${String(x.at).length > 10 ? `<small>${esc(String(x.at).slice(11, 16))}</small>` : ''}</div><div class="sp2-call-ico" aria-hidden="true">${meanIco(x.means)}</div>
                <div class="sp2-call-body"><b>${x.person_id ? `<button type="button" class="table-link" data-h-person="${x.person_id}">${esc(nameOf(D, x.person_id) || x.who)}</button>` : esc(x.who)}</b>${x.minutes ? ` <small class="muted">· ${esc(i18n('{n} min', {n: x.minutes}))}</small>` : ''}${x.research ? ' ' + badge(i18n('recherche'), 'violet') : ''}${x.origin ? ' ' + badge(i18n('du dossier fusionné'), 'grey') : ''}
                <p>${esc(x.summary)}</p>${x.next ? `<p class="sp2-next">→ ${esc(x.next)}</p>` : ''}${x.mail ? `<small class="muted">${esc(i18n('Registre de courriers, n° {n}', {n: x.id}))}</small>` : ''}</div>
                ${x.mail || ro ? '' : `<div class="sp2-call-act"><button type="button" class="icon-button small" data-sp2-call-edit="${x.id}" aria-label="${esc(i18n('✎ Modifier'))}" title="${esc(i18n('✎ Modifier'))}">✎</button><button type="button" class="icon-button small" data-sp2-call-del="${x.id}" aria-label="${esc(i18n('Supprimer'))}" title="${esc(i18n('Supprimer'))}">🗑</button></div>`}</li>`).join('')}</ul>`
                : A().empty(i18n('Aucun échange noté.'), {icon: '📞'});
        }
        draw();
    }
    function callDialog(D, call = null, pid = 0) {
        const c = call || {};
        const val = c.person_id || pid || (c.who ? `txt:${c.who}` : null);
        ext.openDialog({eyebrow: `📞 ${D.number}`, title: call ? i18n('✎ Corriger un échange') : i18n('＋ Noter un échange'), wide: true, submitLabel: i18n('Noter'),
            body: `<div class="succ-form"><div class="succ-2"><label>${esc(i18n('Quand'))}<input type="datetime-local" name="at" value="${esc(c.at ? c.at.replace(' ', 'T').slice(0, 16) : nowLocal())}"></label>
                <div><span class="pk-lab">${esc(i18n('Avec (héritier, notaire, mairie…)'))}</span>${P().pickerField({name: 'who', kind: 'person', animals: false, allowFree: true, value: val})}</div></div>
                <span class="pk-lab">${esc(i18n('Moyen'))}</span>${seg('means', MEANS.map(([k, ic, l]) => [k, `${ic} ${l}`]), c.means || 'phone')}
                <label>${esc(i18n('Résumé'))}<textarea name="summary" rows="4" maxlength="4000">${esc(c.summary || '')}</textarea></label>
                <div class="succ-2"><label>${esc(i18n('Prochaine action'))}<input name="next" maxlength="300" value="${esc(c.next || '')}"></label><label>${esc(i18n('Pour le'))}<input type="date" name="due"></label></div>
                <div class="succ-2"><label>${esc(i18n('Durée (minutes)'))}<input type="number" name="minutes" min="0" max="1440" value="${esc(c.minutes || '')}"></label><div>${call ? '' : ck(i18n('⏱ Compter la durée dans 💶 Temps'), 'name="count_time"')}</div></div>
                ${ck(i18n('C’est une recherche (va dans 🕵️ Recherches)'), 'name="research"', c.research)}${ck(i18n('Ne répond pas'), 'name="noanswer"', c.noanswer)}
                <p class="ui-hint">${esc(i18n('Avec une date, une échéance va dans le dossier et dans la 🔔 cloche (jamais le résumé).'))}</p></div>`,
            onOpen: dlg => ext.succHomonym?.attach?.(dlg, D, {where: 'call', ids: () => { const w = dlg.querySelector('[name=who]')?.value || ''; return /^\d+$/.test(w) ? [Number(w)] : []; }}), // ⚠️ homonyme (heritage-complements.js)
            onSubmit: async f => {
                const w = f.querySelector('[name=who]')?.value || '';
                const body = {op: 'p2_call_save', case_id: D.id, id: c.id || 0, at: f.at.value, person_id: /^\d+$/.test(w) ? Number(w) : 0, who: w.startsWith('txt:') ? w.slice(4) : '', means: f.querySelector('[name=means]:checked')?.value || 'phone',
                    summary: f.summary.value, next: f.next.value, due: f.due.value, minutes: Number(f.minutes.value) || 0, count_time: f.count_time?.checked ? 1 : 0, research: f.research.checked ? 1 : 0, noanswer: f.noanswer.checked ? 1 : 0};
                let r; try { r = await post(body); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(call ? i18n('Échange corrigé (noté au 🕓 Journal)') : i18n('Échange noté'), {undo: async () => { await post(call ? {op: 'p2_call_undo_edit', case_id: D.id, prev: r.prev} : {op: 'p2_call_delete', case_id: D.id, id: r.id}); reload(); }});
                if (r.propose_silence && body.person_id && await A().confirmBox(i18n('Trois fois « ne répond pas » de suite : noter 🔇 ne répond pas ?'), {title: i18n('Contact'), okLabel: i18n('Noter')})) { await post({op: 'contact_state', case_id: D.id, person_id: body.person_id, state: 'silence'}).catch(() => {}); }
                reload();
            }});
    }

    /* ═════ 4. 📮 Recommandés (l'app n'interroge pas La Poste) ═════ */
    const REC = [['ar', 'avec AR'], ['sans', 'sans AR'], ['suivie', 'lettre suivie'], ['', 'pas en recommandé']];
    function recDialog(D, kid, rec0 = null, after = null) {
        const r = rec0 || D?.p2?.rec?.[kid] || {}, set = cfg();
        const k = (D?.courriers || []).find(x => x.id === kid) || {};
        const days = r.days ?? set.rec_relance;
        ext.openDialog({eyebrow: `📮 ${kid}`, title: k.objet || i18n('Recommandé'), wide: true, submitLabel: i18n('Enregistrer'),
            body: `<div class="succ-form"><span class="pk-lab">${esc(i18n('Envoyé en recommandé'))}</span>${seg('kind', REC, r.kind ?? 'ar')}
                <div class="succ-2"><label>${esc(i18n('N° du recommandé'))}<input name="num" maxlength="40" value="${esc(r.num || '')}" autocomplete="off" data-sp2-recnum></label><label>${esc(i18n('Date d’envoi'))}<input type="date" name="date_envoi" value="${esc(r.sent || k.date_envoi || today())}"></label></div>
                <p class="ui-hint" data-sp2-recwarn hidden>${esc(i18n('Numéro inhabituel, gardé tel quel.'))}</p>
                <div class="succ-2"><label>${esc(i18n('AR reçu le'))}<input type="date" name="ar_date" value="${esc(r.ar_date || '')}"></label><label>${esc(i18n('Relance si rien après (jours)'))}<input type="number" name="days" min="1" max="120" value="${esc(days)}"></label></div>
                <div class="succ-2"><label>${esc(i18n('Réponse reçue le'))}<input type="date" name="reponse_le" value="${esc(r.reponse_le || '')}"></label><label>${esc(i18n('Retour du courrier'))}<select name="state"><option value="">—</option><option value="npai"${r.state === 'npai' ? ' selected' : ''}>${esc(i18n('pli non distribué'))}</option><option value="inconnu"${r.state === 'inconnu' ? ' selected' : ''}>${esc(i18n('destinataire inconnu'))}</option></select></label></div>
                <div class="cl-out"><button type="button" class="button small secondary" data-sp2-ar-today>✓ ${esc(i18n('AR reçu aujourd’hui'))}</button>${set.rec_link === 'yes' ? `<button type="button" class="button small secondary" data-sp2-track>↗ ${esc(i18n('Suivre en ligne'))}</button>` : `<button type="button" class="button small secondary" data-sp2-copynum>${esc(i18n('Copier le numéro'))}</button>`}${setLink('rec_relance')}</div>
                <p class="ui-hint">${esc(i18n('L’app ne fait aucune requête : le lien ouvre la page de suivi dans ton navigateur ; tu notes toi-même la date de l’AR.'))}</p></div>`,
            onOpen: d => {
                const f = d.querySelector('form'), num = f.num, warn = d.querySelector('[data-sp2-recwarn]');
                const chk = () => { warn.hidden = !num.value.trim() || C().recNumOk(num.value); }; num.addEventListener('input', chk); chk();
                d.querySelector('[data-sp2-ar-today]').addEventListener('click', () => { f.ar_date.value = today(); });
                d.querySelector('[data-sp2-track]')?.addEventListener('click', () => { const u = C().trackUrl(set.rec_url, num.value); if (!u) return toast(i18n('Tape d’abord le numéro.'), 'error'); const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); });
                d.querySelector('[data-sp2-copynum]')?.addEventListener('click', () => { navigator.clipboard?.writeText(num.value.trim()).then(() => toast(i18n('Numéro copié'))).catch(() => {}); });
            },
            onSubmit: async f => {
                const body = {op: 'p2_rec_set', courrier_id: kid, kind: f.querySelector('[name=kind]:checked')?.value ?? '', num: f.num.value.trim(), date_envoi: f.date_envoi.value, ar_date: f.ar_date.value, days: Number(f.days.value) || null, reponse_le: f.reponse_le.value, state: f.state.value};
                let res; try { res = await post(body); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('Courrier mis à jour'), {undo: async () => { await post({op: 'p2_rec_set', courrier_id: kid, undo: 1, ...Object.fromEntries(Object.entries(res.prev || {}).map(([k2, v]) => [{recommande: 'kind', recommande_num: 'num', ar_relance_jours: 'days', ar_etat: 'state'}[k2] || k2, v]))}); after ? after() : reload(); }});
                if (body.state && D && k.person_id && await A().confirmBox(i18n('Courrier revenu : noter 🔎 introuvable pour cet héritier ?'), {title: i18n('Contact'), okLabel: i18n('Noter')})) await post({op: 'contact_state', case_id: D.id, person_id: k.person_id, state: 'introuvable'}).catch(() => {});
                after ? after() : reload();
            }});
    }
    SP.recDialog = recDialog;
    const recBadge = r => (!r?.kind ? '' : r.ar_date ? badge(i18n('✓ AR {d}', {d: fmtDate(r.ar_date)}), 'green') : r.state ? badge(i18n('revenu'), 'red') : r.kind === 'ar' ? badge(i18n('📮 sans AR · {n} j', {n: Math.max(0, -(daysTo(r.sent) ?? 0))}), 'yellow') : badge(`📮 ${i18n(REC.find(x => x[0] === r.kind)?.[1] || '')}`, 'blue'));
    /** la vue « Courriers » : filtre 📮 et colonne du numéro */
    SP.mailExtra = async (body, rows) => {
        if (body.querySelector('[data-sp2-recf]')) return;
        let rec = {}; try { rec = (await get('p2_rec_list')).items || {}; } catch (_) { return; }
        const n = Object.values(rec).filter(r => r.kind).length, noAr = Object.values(rec).filter(r => r.kind === 'ar' && !r.ar_date).length;
        body.querySelector('.succ-scroll')?.insertAdjacentHTML('beforebegin', `<div class="segmented sp2-recf" data-sp2-recf role="group"><button type="button" class="is-active" data-sp2-recfv="">${esc(i18n('Tous'))}</button><button type="button" data-sp2-recfv="rec">📮 ${esc(i18n('Recommandés'))}</button><button type="button" data-sp2-recfv="noar">${esc(i18n('Sans AR'))}</button></div> <small class="muted">${esc(i18n('{n} recommandés, {m} sans accusé', {n, m: noAr}))}</small>`);
        const paint = () => body.querySelectorAll('tr[data-succ-mrow]').forEach(tr => {
            const id = tr.dataset.succMrow, r = rec[id]; const act = tr.querySelector('.succ-mact');
            if (act && !act.querySelector('[data-sp2-rec]')) act.insertAdjacentHTML('afterbegin', `<span class="sp2-recbadge">${recBadge(r)}${r?.num ? ` <small data-i18n-off>${esc(r.num)}</small>` : ''}</span> <button type="button" class="button small secondary" data-sp2-rec="${id}">📮</button> `);
        });
        paint(); new MutationObserver(paint).observe(body.querySelector('[data-succ-mrows]') || body, {childList: true});
        body.addEventListener('click', e => {
            const f = e.target.closest('[data-sp2-recfv]'); if (f) { body.querySelectorAll('[data-sp2-recfv]').forEach(b => b.classList.toggle('is-active', b === f)); const v = f.dataset.sp2Recfv; body.querySelectorAll('tr[data-succ-mrow]').forEach(tr => { const r = rec[tr.dataset.succMrow]; tr.hidden = v === 'rec' ? !r?.kind : v === 'noar' ? !(r?.kind === 'ar' && !r.ar_date) : false; }); return; }
            const b = e.target.closest('[data-sp2-rec]'); if (b) { const id = Number(b.dataset.sp2Rec); recDialog({courriers: rows.map(x => ({id: x.id, objet: x.objet, date_envoi: x.date_envoi, person_id: x.person_id})), id: rows.find(x => x.id === id)?.case_id || 0}, id, rec[id] || {}, () => ext.successoral?.openCase?.(0)); }
        });
    };

    /* ═════ ✉️ Héritiers contactés : 📋 questionnaire, 📮 recommandé par courrier ═════ */
    function contactsExtra(body, D, R, ro) {
        const acts = body.querySelector('.succ-box-head .succ-acts');
        if (acts && !ro) acts.insertAdjacentHTML('beforeend', `<button type="button" class="button secondary" data-sp2-q>📋 ${esc(i18n('Questionnaire…'))}</button><button type="button" class="button secondary" data-sp2-q-import>⤓ ${esc(i18n('Importer des réponses…'))}</button><button type="button" class="button secondary" data-sp2-q-paper>✍ ${esc(i18n('Saisir un questionnaire papier'))}</button>${SP.contractButton ? SP.contractButton() : ''}`);
        body.querySelectorAll('select[data-succ-answer]').forEach(sel => {
            const id = Number(sel.dataset.succAnswer), r = D.p2?.rec?.[id];
            sel.closest('td')?.insertAdjacentHTML('beforeend', ` <span class="sp2-recbadge">${recBadge(r)}</span>${ro ? '' : ` <button type="button" class="icon-button small" data-sp2-rec="${id}" title="${esc(i18n('📮 Recommandé'))}" aria-label="${esc(i18n('📮 Recommandé'))}">📮</button>`}`);
        });
        const q = D.p2?.questionnaires || [];
        if (q.length) after(body, `<section class="succ-box"><h3>📋 ${esc(i18n('Questionnaires'))}</h3><ul>${q.map(x => `<li>${esc(nameOf(D, x.person_id))} · ${esc(i18n('préparé le {d}', {d: fmtDate(x.made_at.slice(0, 10))}))}${x.answered_at ? ' · ' + badge(i18n('réponses écrites le {d}', {d: fmtDate(x.answered_at.slice(0, 10))}), 'green') : ''}</li>`).join('')}</ul></section>`, 'contacts');
    }

    /* ═════ 2. 📋 Questionnaire ═════ */
    const QF = [['civil', 'Son état civil', 'nom de naissance, prénoms, date et lieu de naissance'], ['spouses', 'Conjoint(s)', 'mariage, PACS, divorce, dates'], ['children', 'Enfants', 'prénoms, dates de naissance, décédés ?'], ['contact', 'Adresse, téléphone, courriel', ''], ['family', 'Autres membres de la famille connus', 'avec un moyen de les joindre'], ['documents', 'Documents qu’il peut fournir', 'livret de famille, actes, jugement…'], ['question', 'Une question à toi', '']];
    const qTexts = () => ({title: i18n('Questionnaire'), about: i18n('au sujet d’une succession'), file: i18n('dossier'), you: i18n('Vous'), last: i18n('Nom de naissance'), first: i18n('Prénoms'), birth: i18n('Date de naissance'), birthPlace: i18n('Lieu de naissance'),
        spouses: i18n('Conjoint(s)'), name: i18n('Prénom et nom'), marriage: i18n('Date du mariage (ou PACS)'), place: i18n('Lieu'), children: i18n('Enfants'), dead: i18n('décédé(e)'), contact: i18n('Adresse, téléphone, courriel'), address: i18n('Adresse'), postal: i18n('Code postal'),
        city: i18n('Ville'), phone: i18n('Téléphone'), email: i18n('Courriel'), family: i18n('Autres membres de la famille connus'), familyHint: i18n('Frères, sœurs, cousins…, avec un moyen de les joindre'), documents: i18n('Documents que vous pouvez fournir'),
        docList: [i18n('livret de famille'), i18n('acte de naissance'), i18n('acte de mariage'), i18n('jugement')], other: i18n('autre'), question: i18n('Une question'), privacy: i18n('Vos réponses restent sur cet appareil tant que vous n’envoyez rien.'), save: i18n('Enregistrer mes réponses')});
    function qDialog(D, R) {
        const heirs = OC().recipients(D, R), set = cfg();
        ext.openDialog({eyebrow: `📋 ${D.number}`, title: i18n('Un questionnaire à envoyer'), wide: true, submitLabel: i18n('Fabriquer et ranger au Registre'),
            body: `<div class="succ-form"><span class="pk-lab">${esc(i18n('Pour'))}</span><ul class="succ-letter-who">${heirs.map(h => `<li>${ck(h.name, `data-sp2-qto="${h.id}"`, h.checked, h.address)}</li>`).join('')}</ul>
                <span class="pk-lab">${esc(i18n('Ce qu’on demande'))}</span>${QF.map(([k, l, sub]) => ck(i18n(l), `data-sp2-qf="${k}"`, k !== 'question', sub ? i18n(sub) : '')).join('')}
                <label>${esc(i18n('Ta question'))}<input name="question" maxlength="600"></label>
                <span class="pk-lab">${esc(i18n('Comment l’envoyer'))}</span>${seg('how', [['file', '💾 Fichier à remplir'], ['paper', '🖨 Papier (PDF)'], ['both', 'Les deux']], 'file')}
                <span class="pk-lab">${esc(i18n('Ce qui est pré-rempli'))}</span>${seg('prefill', [['yes', 'Ce qui le concerne'], ['no', 'Rien']], set.q_prefill)}
                <p class="ui-hint">${esc(i18n('Jamais le nom du défunt ni un montant : « au sujet d’une succession ». Le fichier s’ouvre d’un double-clic, sans internet ; l’héritier renvoie un petit fichier.'))} ${setLink('q_format')}</p></div>`,
            onOpen: dlg => ext.succHomonym?.attach?.(dlg, D, {where: 'questionnaire', ids: () => [...dlg.querySelectorAll('[data-sp2-qto]:checked')].map(x => Number(x.dataset.sp2Qto))}), // ⚠️ avant ⤓ Fabriquer
            onSubmit: async f => {
                const ids = [...f.querySelectorAll('[data-sp2-qto]:checked')].map(x => Number(x.dataset.sp2Qto));
                const fields = [...f.querySelectorAll('[data-sp2-qf]:checked')].map(x => x.dataset.sp2Qf);
                if (!ids.length) return UI().fail(f.question, i18n('Coche au moins un héritier.'));
                const how = f.querySelector('[name=how]:checked')?.value || 'file';
                let r; try { r = await post({op: 'p2_q_make', case_id: D.id, person_ids: ids, fields, question: f.question.value, prefill: f.querySelector('[name=prefill]:checked')?.value || 'yes', register: 1}); } catch (e) { toast(e.message, 'error'); return false; }
                const T = qTexts(), cab = SP.cabinet()?.name || '';
                for (const it of r.items) {
                    const html = C().questionnaireHtml(it, T, {format: cfg().q_format, cabinet: cab, lang: window.LCNDA_I18N?.lang || 'fr'});
                    if (how !== 'paper') dl(`questionnaire-${it.number}-${it.person_id}.html`, new Blob([html], {type: 'text/html'}));
                    if (how !== 'file') UI().openPrintDialog({title: T.title, key: 'succ-q', paper: 'A4', photos: false, html: `<section data-k-page style="font:11pt Georgia,serif">${html.replace(/^[\s\S]*<body>|<script[\s\S]*$/g, '').replace(/<input[^>]*>/g, '<div style="border-bottom:1px solid #999;height:7mm"></div>').replace(/<button[\s\S]*?<\/button>/g, '')}</section>`});
                }
                A().undoToast(i18n('{n} prêts, rangés au Registre de courriers', {n: plural(r.items.length, 'questionnaire')}), {undo: async () => { await post({op: 'p2_q_undo_make', case_id: D.id, tokens: r.items.map(x => x.token), courriers: r.courriers || []}); reload(); }});
                reload();
            }});
    }
    function qImport(D) {
        const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.html,application/json,text/html';
        input.addEventListener('change', async () => {
            const file = input.files?.[0]; if (!file) return;
            if (file.size > 3e6) return toast(i18n('Fichier trop gros.'), 'error');
            const data = C().readAnswers(await file.text());
            if (!data) return toast(i18n('Ce fichier ne vient pas d’un questionnaire de ce dossier.'), 'error');
            let r; try { r = await post({op: 'p2_q_check', case_id: D.id, file: data}); } catch (e) { return toast(e.message, 'error'); }
            qReview(D, r, {file: data});
        });
        input.click();
    }
    function qPaper(D, R) {
        const heirs = OC().recipients(D, R);
        ext.openDialog({eyebrow: '✍', title: i18n('Saisir un questionnaire papier'), wide: true, submitLabel: i18n('Revoir avant d’écrire'),
            body: `<div class="succ-form"><label>${esc(i18n('Héritier'))}<select name="pid">${heirs.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}</select></label>
                <div class="succ-2"><label>${esc(i18n('Date de naissance'))}<input name="birth"></label><label>${esc(i18n('Lieu de naissance'))}<input name="birth_place"></label></div>
                <div class="succ-2"><label>${esc(i18n('Conjoint'))}<input name="sp_name"></label><label>${esc(i18n('Date du mariage (ou PACS)'))}<input name="sp_date"></label></div>
                <label>${esc(i18n('Enfants (un par ligne : prénom, année)'))}<textarea name="kids" rows="3"></textarea></label>
                <div class="succ-2"><label>${esc(i18n('Adresse'))}<input name="address"></label><label>${esc(i18n('Ville'))}<input name="city"></label></div>
                <label>${esc(i18n('Autres membres de la famille connus'))}<textarea name="family" rows="2"></textarea></label><label>${esc(i18n('Documents promis'))}<input name="docs"></label></div>`,
            onSubmit: async f => {
                const kids = f.kids.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [name, birth = ''] = l.split(/,\s*/); return {name, birth}; });
                const answers = {birth: f.birth.value, birth_place: f.birth_place.value, spouses: f.sp_name.value ? [{name: f.sp_name.value, date: f.sp_date.value}] : [], children: kids, address: f.address.value, city: f.city.value, family: f.family.value, documents: f.docs.value ? f.docs.value.split(/,\s*/) : []};
                let r; try { r = await post({op: 'p2_q_check', case_id: D.id, paper: 1, person_id: Number(f.pid.value), answers}); } catch (e) { toast(e.message, 'error'); return false; }
                setTimeout(() => qReview(D, r, {paper: 1, person_id: Number(f.pid.value), answers}), 50);
            }});
    }
    const QROW = {birth: 'Naissance', children: 'Enfants', address: 'Adresse', family: 'Famille connue', documents: 'Documents', question: 'Sa question'};
    function qReview(D, r, src) {
        ext.openDialog({eyebrow: '📋', title: i18n('Réponses de {n}', {n: r.name}), wide: true, submitLabel: i18n('Écrire les changements cochés'),
            body: `${r.earlier ? UI().notice('warn', i18n('Une réponse a déjà été importée le {d} : compare avec celle-ci.', {d: fmtDate(String(r.earlier).slice(0, 10))})) : ''}${src.file ? `<p>${badge(i18n('fichier vérifié ✓ (bon questionnaire, pas modifié)'), 'green')}</p>` : ''}
                <p class="muted">${esc(i18n('Coche ce qui doit aller dans le dossier. Rien n’est écrit sans ta revue ; « source : déclaration de l’héritier » accompagne tout ce qui est écrit.'))}</p>
                <div class="succ-scroll"><table class="succ-table sp2-qrev"><thead><tr><th></th><th>${esc(i18n('Champ'))}</th><th>${esc(i18n('Dans la base'))}</th><th>${esc(i18n('Réponse'))}</th></tr></thead><tbody data-i18n-off>
                ${r.rows.map(x => `<tr><td>${x.key === 'question' ? '' : `<input type="checkbox" data-sp2-qk="${esc(x.key)}"${x.check ? ' checked' : ''} aria-label="${esc(i18n('Écrire'))}">`}</td><td>${esc(i18n(QROW[x.key] || (x.key.startsWith('spouse') ? 'Conjoint' : x.key)))}</td><td>${x.base ? `<s>${esc(x.base)}</s>` : '—'}</td><td class="sp2-new">${esc(x.answer)}</td></tr>`).join('')}</tbody></table></div>
                <p class="ui-hint">${esc(i18n('« Famille connue » va en note du dossier, jamais en fiches. Les enfants créent des fiches reliées à l’héritier. Les documents promis deviennent une échéance.'))}</p>`,
            onSubmit: async f => {
                const keys = [...f.querySelectorAll('[data-sp2-qk]:checked')].map(x => x.dataset.sp2Qk);
                if (!keys.length) return;
                let x; try { x = await post({op: 'p2_q_apply', case_id: D.id, keys, ...src}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('{n} écrits. Calcul refait.', {n: plural(x.changes, 'changement')}), {undo: async () => { await post({op: 'p2_q_undo_apply', case_id: D.id, token: x.undo_token || r.token}); reload(); }});
                reload();
            }});
    }

    /* ═════ 📁 Dossier : 🗓 dates importantes, 🔗 dossiers liés ═════ */
    function dossierExtra(body, D, ro) {
        const imp = D.p2?.imp || {}, set = cfg();
        const list = (D.deadlines || []).filter(x => imp[x.id]);
        const remTxt = x => C().reminders(x.due, imp[x.id].reminders, imp[x.id].seen, today());
        const line = x => { const n = daysTo(x.due), i = imp[x.id], rr = remTxt(x);
            return `<tr class="${x.done ? 'is-done' : ''}"><td><b>${esc(fmtDate(x.due))}</b><br><small class="muted">${x.done ? esc(i18n('Fait')) : n < 0 ? esc(i18n('passée')) : esc(i18n('dans {n} j', {n}))}</small>${i.prev_due ? `<br><small class="muted">${esc(i18n('était le {d}', {d: fmtDate(i.prev_due)}))}</small>` : ''}</td><td>${esc(x.label)}</td><td>${esc(i.origin)}</td>
                <td>${(rr?.list || []).map(r => badge(i18n('J−{n}', {n: String(r.j)}), String(i.seen).split(',').includes(String(r.j)) ? 'grey' : 'blue')).join(' ')}</td><td>${ro ? '' : `<button type="button" class="icon-button small" data-sp2-imp-edit="${x.id}" aria-label="${esc(i18n('✎ Modifier'))}" title="${esc(i18n('✎ Modifier'))}">✎</button>`}</td></tr>`; };
        const add = ro ? '' : `<button type="button" class="button small secondary" data-sp2-imp-add>＋ ${esc(i18n('Une date importante'))}</button>`;
        const dlBox = [...body.querySelectorAll('.succ-box')].find(b => b.querySelector('[data-succ-dl-add], .succ-deadlines'));
        if (set.dates_place === 'same' && dlBox) {
            dlBox.querySelector('.succ-box-head')?.insertAdjacentHTML('beforeend', add);
            dlBox.querySelectorAll('[data-succ-dl-done]').forEach(cb => { const id = Number(cb.dataset.succDlDone); const i = imp[id]; if (!i) return; const li = cb.closest('li'); li?.classList.add('sp2-imp'); li?.querySelector('span')?.insertAdjacentHTML('afterbegin', '🗓 '); li?.querySelector('span')?.insertAdjacentHTML('beforeend', ` <small class="muted">· ${esc(i.origin)}</small>${ro ? '' : ` <button type="button" class="link-button" data-sp2-imp-edit="${id}">✎</button>`}`); });
        } else {
            if (set.dates_place === 'apart' && dlBox) dlBox.querySelectorAll('[data-succ-dl-done]').forEach(cb => { if (imp[Number(cb.dataset.succDlDone)]) cb.closest('li')?.remove(); });
            const html = `<section class="succ-box sp2-imp-box"><div class="succ-box-head"><h3>🗓 ${esc(i18n('Mes dates importantes'))}</h3>${add}</div>${list.length ? `<div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('Date'))}</th><th>${esc(i18n('Quoi'))}</th><th>${esc(i18n('D’où vient cette date'))}</th><th>${esc(i18n('Rappels'))}</th><th></th></tr></thead><tbody>${list.map(line).join('')}</tbody></table></div>` : `<p class="muted">${esc(i18n('Les dates que le notaire t’a données, rappelées à temps.'))}</p>`}
                <p class="ui-hint">${esc(i18n('L’app ne calcule aucun délai légal : elle ne connaît pas ta situation.'))} ${setLink('dates_place')}</p></section>`;
            if (dlBox) dlBox.insertAdjacentHTML('beforebegin', html); else body.insertAdjacentHTML('beforeend', html);
        }
        if (D.p2?.linked?.length) body.insertAdjacentHTML('beforeend', `<section class="succ-box"><h3>🔗 ${esc(i18n('Dossiers liés'))}</h3><p>${D.p2.linked.map(l => `<button type="button" class="table-link" data-succ-open="${l.id}">${esc(l.number)} · ${esc(l.title)}</button>`).join(' · ')}</p></section>`);
    }
    function impDialog(D, x = null) {
        const i = x ? D.p2.imp[x.id] : null, rem = String(i ? i.reminders : cfg().dates_reminders).split(',').filter(Boolean);
        ext.openDialog({eyebrow: '🗓', title: x ? i18n('✎ Modifier la date') : i18n('＋ Une date importante'), submitLabel: i18n('Enregistrer'),
            body: `<div class="succ-form"><div class="succ-2"><label>${esc(i18n('Date'))}<input type="date" name="due" value="${esc(x?.due || '')}" required></label><label>${esc(i18n('Quoi'))}<input name="label" maxlength="300" value="${esc(x?.label || '')}" required></label></div>
                <label>${esc(i18n('D’où vient cette date (obligatoire)'))}<input name="origin" maxlength="300" value="${esc(i?.origin || '')}" placeholder="${esc(i18n('ex. : Me VIALLE, courriel du 4 nov.'))}" required></label>
                <span class="pk-lab">${esc(i18n('Rappels'))}</span><div class="sp2-rem">${['30', '7', '1'].map(j => ck(i18n('J−{n}', {n: j}), `data-sp2-rem="${j}"`, rem.includes(j))).join('')}<label>${esc(i18n('Autre :'))} <input type="number" min="0" max="365" name="rem_other" value="${esc(rem.filter(j => !['30', '7', '1'].includes(j)).join(','))}"></label></div>
                ${x ? `<p class="ui-hint">${esc(i18n('Date déplacée : l’ancienne reste en dessous et la modification est notée au 🕓 Journal.'))}</p>` : ''}</div>`,
            onSubmit: async f => {
                const rems = [...f.querySelectorAll('[data-sp2-rem]:checked')].map(c => c.dataset.sp2Rem).concat(f.rem_other.value ? [f.rem_other.value] : []).join(',');
                let r; try { r = await post({op: 'p2_imp_save', case_id: D.id, id: x?.id || 0, due: f.due.value, label: f.label.value, origin: f.origin.value, reminders: rems}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(x ? i18n('Date modifiée') : i18n('Date importante ajoutée'), {undo: async () => { await post({op: 'p2_imp_undo', case_id: D.id, id: r.id, prev: r.prev || null}); reload(); }});
                reload();
            }});
    }

    /* ═════ 📑 Pièces : 🔗 double preuve, 📮 une lettre par service, 📅 date de délivrance ═════ */
    function piecesExtra(body, D, R, P_, ro) {
        const set = cfg(), pl = C().proofLinks(D, R, P_, {min: Number(set.proof_min)}), issued = D.p2?.issued || {};
        const msg = pl.none || pl.one ? i18n('🔗 {a} liens ne reposent que sur une pièce, {b} sur aucune. Ce n’est pas une erreur : c’est à vérifier avant la remise.', {a: Number(set.proof_min) >= 2 ? pl.one : 0, b: pl.none}) : i18n('🔗 Chaque lien repose sur assez de pièces.');
        const groups = C().groupMissing(D, P_, {scope: set.group_scope, t: i18n});
        body.querySelector('.succ-box')?.insertAdjacentHTML('afterbegin', `<div class="sp2-proof-band${pl.none ? ' is-bad' : pl.one ? ' is-warn' : ''}"><span>${esc(msg)}</span><button type="button" class="button small secondary" data-sp2-proof>${esc(i18n('Voir les liens'))}</button>${!ro && groups.length ? `<button type="button" class="button small secondary" data-sp2-group>📮 ${esc(i18n('Une lettre par service ({n})', {n: groups.length}))}</button>` : ''}</div>`);
        body.querySelectorAll('tr[data-succ-piece]').forEach(tr => {
            const key = tr.dataset.succPiece, i = issued[key];
            const cell = tr.querySelector('.succ-p-act'); if (!cell) return;
            let txt = '';
            if (i?.on) { const end = i.months ? new Date(new Date(i.on + 'T12:00:00').setMonth(new Date(i.on + 'T12:00:00').getMonth() + i.months)).toISOString().slice(0, 10) : ''; txt = `${i18n('délivrée le {d}', {d: fmtDate(i.on)})}${end ? ' · ' + i18n('valable jusqu’au {d}', {d: fmtDate(end)}) : ''}`; }
            cell.insertAdjacentHTML('beforeend', `${txt ? `<small class="muted sp2-issued">📅 ${esc(txt)}</small>` : ''}${ro ? '' : `<button type="button" class="icon-button small" data-sp2-issued="${esc(key)}" title="${esc(i18n('📅 Date de délivrance'))}" aria-label="${esc(i18n('📅 Date de délivrance'))}">📅</button>`}`);
        });
    }
    function proofDialog(D, R, P_) {
        const set = cfg(), pl = C().proofLinks(D, R, P_, {min: Number(set.proof_min)});
        const lv = x => x.level === 'none' ? '⓪' : x.n === 1 ? '①' : x.n === 2 ? '②' : `${x.n}`;
        ext.openDialog({eyebrow: `🔗 ${D.number}`, title: i18n('Chaque maillon : combien de pièces le prouvent'), wide: true, submitLabel: i18n('Fermer'),
            body: `<div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('Lien'))}</th><th>${esc(i18n('Héritier concerné'))}</th><th>${esc(i18n('Pièces'))}</th><th></th></tr></thead><tbody>
                ${pl.links.map(x => `<tr class="sp2-proof-${x.level}"><td>${esc(x.what)}</td><td>${esc(x.heirs.join(', ') || '—')}</td><td><b>${lv(x)}</b> ${x.sources.length ? `<small>${esc(x.sources.join(' ; '))}</small>` : x.state === 'have' ? `<small class="muted">${esc(i18n('en main, cote non notée'))}</small>` : `<small class="muted">${esc(i18n('aucune'))}</small>`}${x.proof ? ' ' + badge(i18n('dossier de preuve « prouvé »'), 'green') : ''}${x.one ? ' ' + badge(i18n('1 pièce, jugée suffisante le {d}', {d: fmtDate(x.one.at)}), 'green') : ''}</td>
                <td>${D.archived ? '' : x.level === 'none' ? (x.state === 'missing' ? `<button type="button" class="button small secondary" data-succ-ask="${esc(x.key)}">📮 ${esc(i18n('Demander l’acte'))}</button>` : '') : `<label class="checkbox-line"><input type="checkbox" data-sp2-oneok="${esc(x.key)}" data-what="${esc(x.what)}"${x.one ? ' checked' : ''}> ${esc(i18n('✓ Une pièce me suffit ici'))}</label>`}</td></tr>`).join('')}</tbody></table></div>
                <p class="ui-hint">${esc(i18n('Une « pièce » = une source citée sur l’acte (deux copies du même acte comptent pour une) ; un dossier de preuve « prouvé » compte pour une de plus.'))} ${setLink('proof_min')}</p>`,
            onOpen: d => d.addEventListener('change', async e => {
                const c = e.target.closest('[data-sp2-oneok]'); if (!c) return;
                let r; try { r = await post({op: 'p2_proof_ok', case_id: D.id, key: c.dataset.sp2Oneok, on: c.checked ? 1 : 0, what: c.dataset.what}); } catch (err) { c.checked = !c.checked; return toast(err.message, 'error'); }
                const was = !c.checked;
                A().undoToast(i18n('Noté au 🕓 Journal'), {undo: async () => { await post({op: 'p2_proof_ok', case_id: D.id, key: c.dataset.sp2Oneok, on: was ? 1 : 0, what: c.dataset.what}); reload(); }});
                D.p2.one_piece_ok = {...(D.p2.one_piece_ok || {})}; if (c.checked) D.p2.one_piece_ok[c.dataset.sp2Oneok] = {at: today()}; else delete D.p2.one_piece_ok[c.dataset.sp2Oneok];
            })});
    }
    /** 📋 « Avant de remettre » : un point de plus (à revoir, ou bloquant : réglage) */
    const wrapChecklist = () => {
        const o = ext.succOutils; if (!o?.checklist || o._p2) return !!o?._p2; o._p2 = true;
        const ck0 = o.checklist, nd0 = o.notaryDialog;
        o.checklist = (D, R, P_) => {
            const ckr = ck0(D, R, P_); const set = cfg();
            try {
                const item = C().proofCheck(C().proofLinks(D, R, P_, {min: Number(set.proof_min)}), {block: set.proof_block === 'block', min: Number(set.proof_min), t: i18n});
                ckr.items.push(item); ckr.total = ckr.items.length;
                if (item.level === 'ok') ckr.ok++; else if (item.level === 'warn') ckr.warn++; else ckr.miss++;
                ckr.ready = !ckr.warn && !ckr.miss; ckr.blocked = !!item.block;
            } catch (_) {}
            return ckr;
        };
        o.notaryDialog = (D, R, P_, go, print) => {
            const ckr = o.checklist(D, R, P_);
            if (ckr.blocked) return ext.openDialog({eyebrow: i18n('📋 AVANT DE REMETTRE'), title: i18n('Remise bloquée (réglage)'), wide: true, submitLabel: i18n('Fermer'), body: `${o.checklistHtml(D, R, P_)}${UI().notice('error', i18n('Des liens ont trop peu de pièces : la remise est bloquée tant qu’ils ne sont pas complétés (ou « Une pièce me suffit ici »).'))}<p>${setLink('proof_block')}</p>`});
            return nd0(D, R, P_, go, print);
        };
        return true;
    };
    if (!wrapChecklist()) document.addEventListener('DOMContentLoaded', wrapChecklist, {once: true});
    function groupDialog(D, R, P_) {
        const groups = C().groupMissing(D, P_, {scope: cfg().group_scope, t: i18n});
        const letter = g => [i18n('Madame, Monsieur,'), i18n('Pour une recherche, je vous serais reconnaissant(e) de m’adresser une copie des actes suivants :'), g.items.map(it => `– ${it.what}${it.act ? ' (' + it.act + ')' : ''}`).join('\n'), i18n('Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.')].join('\n\n');
        ext.openDialog({eyebrow: '📮', title: i18n('Les actes manquants, regroupés'), wide: true, submitLabel: i18n('📋 Ranger dans le Registre de courriers'),
            body: `<p class="muted">${esc(i18n('Une seule lettre par service au lieu d’une par acte : moins de timbres, moins de relances. Relis et corrige chaque lettre.'))} ${setLink('group_scope')}</p>
                ${groups.map((g, gi) => `<fieldset class="sp2-group"><legend>${ck(`${g.service} · ${plural(g.keys.length, 'acte')}`, `data-sp2-g="${gi}"`, true)}</legend><label>${esc(i18n('Destinataire'))}<input data-sp2-gs="${gi}" value="${esc(g.service)}" maxlength="200"></label><textarea data-sp2-gl="${gi}" rows="7" class="cl-letter">${esc(letter(g))}</textarea></fieldset>`).join('')}
                <div class="succ-2"><label>${esc(i18n('Envoyé le'))}<input type="date" name="date_envoi" value="${today()}"></label><label>${esc(i18n('Relance dans (jours)'))}<input type="number" name="relance_jours" min="0" max="365" value="30"></label></div>`,
            onSubmit: async f => {
                const gs = groups.map((g, gi) => ({g, gi})).filter(({gi}) => f.querySelector(`[data-sp2-g="${gi}"]`)?.checked).map(({g, gi}) => ({service: f.querySelector(`[data-sp2-gs="${gi}"]`).value, keys: g.keys, letter: f.querySelector(`[data-sp2-gl="${gi}"]`).value}));
                let r; try { r = await post({op: 'p2_group_letters', case_id: D.id, groups: gs, date_envoi: f.date_envoi.value, relance_jours: Number(f.relance_jours.value) || 0}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('{n} rangées dans le Registre de courriers', {n: plural(r.ids.length, 'lettre')}), {undo: async () => { await post({op: 'p2_group_undo', case_id: D.id, ids: r.ids}); reload(); }});
                reload();
            }});
    }
    function issuedDialog(D, key, what) {
        const i = D.p2?.issued?.[key] || {};
        ext.openDialog({eyebrow: '📅', title: what, submitLabel: i18n('Enregistrer'),
            body: `<div class="succ-form"><label>${esc(i18n('Copie délivrée le'))}<input type="date" name="on" value="${esc(i.on || '')}"></label><label>${esc(i18n('Durée de validité demandée par ton notaire (mois)'))}<input type="number" name="months" min="1" max="120" value="${esc(i.months ?? '')}" placeholder="${esc(i18n('aucune'))}"></label>
                <p class="ui-hint">${esc(i18n('Aucune durée par défaut : c’est toi qui la tapes. La 🔔 cloche prévient avant qu’elle ne soit trop ancienne.'))} ${setLink('validity_warn')}</p></div>`,
            onSubmit: async f => {
                let r; try { r = await post({op: 'p2_piece_issued', case_id: D.id, key, issued_on: f.on.value, valid_months: f.months.value, what}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('Date de délivrance notée'), {undo: async () => { await post({op: 'p2_piece_issued', case_id: D.id, key, issued_on: r.prev.issued_on, valid_months: r.prev.valid_months ?? '', undo: 1}); reload(); }});
                reload();
            }});
    }

    /* ═════ 14. 🕵️ Recherches faites par héritier ═════ */
    async function researchDialog(D, pid) {
        let r; try { r = await get('p2_research', {case_id: D.id, person_id: pid}); } catch (e) { return toast(e.message, 'error'); }
        const name = nameOf(D, pid);
        const table = rows => `<table class="succ-table"><thead><tr><th>${esc(i18n('Date'))}</th><th>${esc(i18n('Où'))}</th><th>${esc(i18n('Quoi'))}</th><th>${esc(i18n('Résultat'))}</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(fmtDate(x.date))}</td><td>${esc(x.where)}</td><td>${esc(x.what)}</td><td>${x.negative ? '∅ ' : ''}${esc(x.result)}</td></tr>`).join('')}</tbody></table>`;
        ext.openDialog({eyebrow: `🕵️ ${D.number}`, title: name, wide: true, submitLabel: i18n('Fermer'),
            body: `${r.rows.length ? `<div class="succ-scroll" data-i18n-off>${table(r.rows)}</div><p>${badge(i18n('recherches négatives : {n}', {n: r.negative}), 'grey')} <small class="muted">${esc(i18n('« Rien trouvé » est un résultat utile : il montre la diligence au notaire.'))}</small></p>` : A().empty(i18n('Aucune recherche notée pour cette personne.'), {icon: '🕵️'})}
                <p class="ui-hint">${esc(i18n('Rien n’est recopié : les lignes viennent du 🗓 Journal des recherches, des ⚰️ vérifications INSEE et des 📞 échanges marqués « recherche ».'))}</p>
                <div class="cl-out">${D.archived ? '' : `<button type="button" class="button small" data-sp2-research-add="${pid}">＋ ${esc(i18n('Noter une recherche'))}</button>`}<button type="button" class="button small secondary" data-sp2-research-csv>${esc(i18n('⤓ Exporter en CSV'))}</button><button type="button" class="button small secondary" data-sp2-research-print>🖨 ${esc(i18n('Pour le notaire'))}</button></div>`,
            onOpen: d => d.addEventListener('click', async e => {
                if (e.target.closest('[data-sp2-research-csv]')) { const q = v => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`; dl(`recherches-${D.number}.csv`, new Blob(['﻿' + [['date', 'où', 'quoi', 'résultat'], ...r.rows.map(x => [x.date, x.where, x.what, x.result])].map(l => l.map(q).join(';')).join('\r\n')], {type: 'text/csv'})); post({op: 'p2_print', what: 'research', case_id: D.id}).catch(() => {}); return; }
                if (e.target.closest('[data-sp2-research-print]')) { UI().openPrintDialog({title: i18n('Recherches faites — {n}', {n: name}), key: 'succ-research', paper: 'A4', photos: false, html: `<section data-k-page style="font:10.5pt Georgia,serif"><h1 style="font-size:15pt">${esc(i18n('Recherches faites — {n}', {n: name}))}</h1><p>${esc(i18n('Dossier {n}', {n: D.number}))}</p>${table(r.rows)}</section>`}); post({op: 'p2_print', what: 'research', case_id: D.id}).catch(() => {}); return; }
                const add = e.target.closest('[data-sp2-research-add]'); if (add) { d.close(); researchAdd(D, pid); }
            })});
    }
    function researchAdd(D, pid) {
        ext.openDialog({eyebrow: '🕵️', title: i18n('＋ Noter une recherche'), submitLabel: i18n('Noter'),
            body: `<div class="succ-form"><label>${esc(i18n('Où (service, site, mairie…)'))}<input name="where" maxlength="200" required></label><div class="succ-2"><label>${esc(i18n('Commune'))}<input name="commune" maxlength="120"></label><label>${esc(i18n('Années'))}<input name="years" maxlength="60"></label></div>
                <label>${esc(i18n('Quoi'))}<input name="what" maxlength="300"></label><label>${esc(i18n('Résultat'))}<select name="result"><option value="found">${esc(i18n('Trouvé'))}</option><option value="none">${esc(i18n('Rien trouvé'))}</option><option value="partial">${esc(i18n('En partie'))}</option></select></label><label>${esc(i18n('Ce qui a été trouvé'))}<textarea name="found" rows="2"></textarea></label>
                <p class="ui-hint">${esc(i18n('Écrit un dépouillement dans le 🗓 Journal des recherches (comme « Où chercher »).'))}</p></div>`,
            onSubmit: async f => { try { await post({op: 'p2_research_add', case_id: D.id, person_id: pid, where: f.where.value, commune: f.commune.value, years: f.years.value, what: f.what.value, result: f.result.value, found: f.found.value}); } catch (e) { toast(e.message, 'error'); return false; } toast(i18n('Recherche notée')); researchDialog(D, pid); }});
    }
    SP.researchDialog = researchDialog;

    /* ═════ 8. 🗺 Carte des héritiers (fond simple hors ligne ; aucune adresse envoyée) ═════ */
    async function mapDialog(caseId) {
        let r; try { r = await get('p2_map', caseId ? {case_id: caseId} : {}); } catch (e) { return toast(e.message, 'error'); }
        const all = [...r.points, ...r.notaries];
        const W = 640, H = 560;
        let svg = '';
        if (all.length) {
            const lats = all.map(p => p.lat), lons = all.map(p => p.lon);
            let [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
            const pad = Math.max(0.3, (b - a) * 0.15, (d - c) * 0.15); a -= pad; b += pad; c -= pad; d += pad;
            const k = Math.cos((a + b) / 2 * Math.PI / 180), sx = W / ((d - c) * k), sy = H / (b - a), s = Math.min(sx, sy);
            const X = lon => (lon - c) * k * s + (W - (d - c) * k * s) / 2, Y = lat => (b - lat) * s + (H - (b - a) * s) / 2;
            const byCity = new Map(); for (const p of r.points) { const key = `${p.lat.toFixed(3)}|${p.lon.toFixed(3)}`; (byCity.get(key) || byCity.set(key, {p, list: []}).get(key)).list.push(p); }
            svg = `<svg class="sp2-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(i18n('Carte des héritiers'))}"><rect width="${W}" height="${H}" class="sp2-map-bg"/>
                ${[...Array(9)].map((_, i) => `<line x1="${i * W / 8}" y1="0" x2="${i * W / 8}" y2="${H}" class="sp2-map-grid"/><line x1="0" y1="${i * H / 8}" x2="${W}" y2="${i * H / 8}" class="sp2-map-grid"/>`).join('')}
                ${r.notaries.map(n => `<g class="sp2-map-not"><rect x="${X(n.lon) - 6}" y="${Y(n.lat) - 6}" width="12" height="12"/><text x="${X(n.lon) + 10}" y="${Y(n.lat) + 4}" class="sp2-map-label" data-sp2-mask>${esc(n.name)}, ${esc(n.city)}</text></g>`).join('')}
                ${[...byCity.values()].map(({p, list}) => `<g class="sp2-map-pt" data-sp2-mappt="${esc(p.lat)}|${esc(p.lon)}" tabindex="0"><circle cx="${X(p.lon)}" cy="${Y(p.lat)}" r="${8 + Math.min(10, list.length * 2)}"/><text x="${X(p.lon)}" y="${Y(p.lat) + 4}" text-anchor="middle" class="sp2-map-n">${list.length}</text><text x="${X(p.lon) + 14}" y="${Y(p.lat) - 10}" class="sp2-map-label">${esc(p.city)}</text></g>`).join('')}</svg>`;
        }
        const listHtml = `<ul class="sp2-map-list">${r.points.map(p => `<li><b data-sp2-name>${esc(p.name)}</b> · ${esc(p.city)} · ${esc(p.share)}${p.dead ? ' †' : ''} ${p.how === 'ban' ? badge(i18n('au numéro (BAN)'), 'blue') : ''} ${caseId ? '' : `<small class="muted">${esc(p.number)}</small>`}</li>`).join('')}</ul>`;
        const offHtml = r.off.length ? `<h4>${esc(i18n('Hors carte'))}</h4><ul>${r.off.map(p => `<li><span data-sp2-name>${esc(p.name)}</span> · ${esc(p.why === 'abroad' ? i18n('à l’étranger ({c})', {c: p.country || ''}) : p.why === 'noplace' ? i18n('commune pas placée ({c})', {c: p.city}) : i18n('adresse inconnue'))}</li>`).join('')}</ul>` : '';
        ext.openDialog({eyebrow: '🗺', title: caseId ? i18n('Où vivent les héritiers') : i18n('Tous les dossiers en cours'), wide: true, submitLabel: i18n('Fermer'),
            body: `${svg || A().empty(i18n('Aucune adresse d’héritier placée sur la carte.'), {icon: '🗺'})}
                <p class="ui-hint">● ${esc(i18n('héritier (adresse connue, au niveau de la commune)'))} · ▪ ${esc(i18n('notaire connu de l’app'))} · ${esc(i18n('Rien n’est envoyé en ligne.'))} ${r.precision === 'ban' && !r.ban_ready ? esc(i18n('La BAN n’est pas encore téléchargée : position à la commune.')) : ''} ${setLink('map_precision')}</p>
                <div data-i18n-off>${listHtml}${offHtml}</div><div class="cl-out"><button type="button" class="button small secondary" data-sp2-map-img>🖼 ${esc(i18n('Image de la carte (sans noms)'))}</button></div>`,
            onOpen: d => d.querySelector('[data-sp2-map-img]')?.addEventListener('click', () => {
                const s = d.querySelector('svg.sp2-map'); if (!s) return;
                const c2 = s.cloneNode(true); c2.querySelectorAll('.sp2-map-label').forEach(x => x.remove()); c2.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                c2.insertAdjacentHTML('afterbegin', '<style>.sp2-map-bg{fill:#f5f3ee}.sp2-map-grid{stroke:#ddd}.sp2-map-pt circle{fill:#2b5bd7;opacity:.8}.sp2-map-n{fill:#fff;font:700 12px sans-serif}.sp2-map-not rect{fill:#8a5a00}</style>');
                dl(`carte-heritiers${caseId ? '-' + (cur()?.number || '') : ''}.svg`, new Blob([c2.outerHTML], {type: 'image/svg+xml'}));
                post({op: 'p2_print', what: 'map', case_id: caseId || 0}).catch(() => {});
            })});
    }

    /* ═════ ⏳ Délai de réponse par organisme ═════ */
    async function delaysDialog() {
        let r; try { r = await get('p2_delays'); } catch (e) { return toast(e.message, 'error'); }
        const set = cfg();
        ext.openDialog({eyebrow: '⏳', title: i18n('Par organisme, d’après le Registre'), wide: true, submitLabel: i18n('Fermer'),
            body: r.items.length ? `<div class="succ-scroll"><table class="succ-table"><thead><tr><th>${esc(i18n('Organisme'))}</th><th>${esc(i18n('Courriers'))}</th><th>${esc(set.delay_stat === 'median' ? i18n('Médiane') : i18n('Moyenne'))}</th></tr></thead><tbody data-i18n-off>${r.items.map(x => `<tr><td>${esc(x.who)}</td><td>${x.n}</td><td>${x.enough ? esc(i18n('{n} jours', {n: x.days})) : `<small class="muted">${esc(i18n('pas assez de courriers'))}</small>`}</td></tr>`).join('')}</tbody></table></div><p class="ui-hint">${esc(i18n('De l’envoi à la réponse reçue (demandes d’actes des dossiers). Aide à prévoir la remise et à relancer au bon moment.'))} ${setLink('delay_stat')}</p>`
                : A().empty(i18n('Pas encore de réponse notée dans le Registre.'), {icon: '⏳'})});
    }

    /* ═════ 🔗 Dossier lié pour un héritier mort après le défunt ═════ */
    async function linkCase(D, pid) {
        if (!await A().confirmBox(i18n('Sa part passe dans sa propre succession : ouvrir un dossier lié pour {n} ?', {n: nameOf(D, pid)}), {title: i18n('🔗 Dossier lié'), okLabel: i18n('Ouvrir le dossier lié')})) return;
        let r; try { r = await post({op: 'p2_link_case', case_id: D.id, person_id: pid}); } catch (e) { return toast(e.message, 'error'); }
        A().undoToast(i18n('Dossier lié {n} ouvert ({what})', {n: r.number, what: plural(r.attached, 'descendant rattaché', 'descendants rattachés')}), {undo: async () => { await post({op: 'p2_link_undo', case_id: D.id, id: r.id, created: r.created ? 1 : 0}); reload(); }});
        ext.successoral?.openCase?.(r.id, 'heirs');
    }

    /* ═════ 13. 👥 Fusion de deux dossiers ═════ */
    async function mergeDialog(D) {
        let list; try { list = (await get('p2_cases')).items.filter(c => c.id !== D.id && !['clos', 'archive'].includes(c.state)); } catch (e) { return toast(e.message, 'error'); }
        if (!list.length) return toast(i18n('Aucun autre dossier en cours dans cette généalogie (d’abord ⇄ Déplacer s’il est dans une autre).'));
        const set = cfg();
        ext.openDialog({eyebrow: '👥', title: i18n('Fusionner avec un autre dossier'), wide: true, submitLabel: i18n('Fusionner'),
            body: `<div class="succ-form"><label>${esc(i18n('Le dossier à réunir dans {n}', {n: D.number}))}<select name="from">${list.map(c => `<option value="${c.id}">${esc(c.number)} · ${esc(c.title)}</option>`).join('')}</select></label>
                <span class="pk-lab">${esc(i18n('Comment'))}</span>${seg('mode', C().SPEC.find(g => g.items.some(i => i.key === 'merge_mode')).items.find(i => i.key === 'merge_mode').options, set.merge_mode)}
                <div data-sp2-mprev>${UI().spinner(i18n('Lecture…'))}</div>
                <p class="ui-hint">${esc(i18n('Le numéro du dossier réuni n’est pas réutilisé. ↶ Annuler sépare à nouveau, comme avant.'))} ${setLink('merge_mode')}</p></div>`,
            onOpen: d => {
                const f = d.querySelector('form');
                const paint = async () => {
                    let p; try { p = await get('p2_merge_preview', {into: D.id, from: f.from.value}); } catch (e) { d.querySelector('[data-sp2-mprev]').innerHTML = UI().notice('error', e.message); return; }
                    const row = (l, a, b, w) => `<tr><th>${esc(i18n(l))}</th><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(w)}</td></tr>`;
                    d.querySelector('[data-sp2-mprev]').innerHTML = `<table class="succ-table"><thead><tr><th>${esc(i18n('Ce qui'))}</th><th>${esc(p.into.number)}</th><th>+ ${esc(p.from.number)}</th><th>${esc(i18n('Ce qui se passe'))}</th></tr></thead><tbody>
                        ${row('Personnes rattachées', p.persons.into, `+${p.persons.added}`, i18n('{a} déjà communes, {b} ajoutées', {a: p.persons.common, b: p.persons.added}))}
                        ${row('Pièces', p.pieces.into, `+${p.pieces.added}`, i18n('{d} en double gardée(s) une fois', {d: p.pieces.double}))}
                        ${row('Courriers, échanges, fonds', '', `+${p.rows.courriers + p.rows.calls + p.rows.funds}`, i18n('rattachés, chacun garde son dossier d’origine en étiquette'))}
                        ${row('Temps et frais, échéances', '', `+${p.rows.fees + p.rows.deadlines}`, i18n('rattachés ; les factures émises ne changent pas'))}
                        ${row('Journaux', '', '', i18n('mis bout à bout, chaque ligne marquée de son dossier'))}</tbody></table>
                        ${p.two_notaries ? `<label>${esc(i18n('Deux notaires différents : lequel garder ?'))}<select name="keep_notary"><option value="into">${esc(p.into.notary)}</option><option value="from">${esc(p.from.notary)}</option></select></label>` : ''}`;
                };
                f.from.addEventListener('change', paint); paint();
            },
            onSubmit: async f => {
                const mode = f.querySelector('[name=mode]:checked')?.value || set.merge_mode;
                let r; try { r = await post({op: 'p2_merge', into: D.id, from: Number(f.from.value), mode, keep_notary: f.keep_notary?.value || 'into'}); } catch (e) { toast(e.message, 'error'); return false; }
                A().undoToast(i18n('Dossiers réunis'), {undo: async () => { await post({op: 'p2_merge_undo', into: D.id}); reload(); }});
                reload();
            }});
    }

    /* ═════ 7. 🖨 Pour le notaire : 🤝 copie et 🕵️ recherches jointes ═════ */
    function notaryExtra(body, D, R, P_) {
        const box = after(body, `<section class="succ-box sp2-notary"><div class="succ-box-head"><h3>🤝 ${esc(i18n('Copie à envoyer au notaire'))}</h3><div class="succ-acts"><button type="button" class="button" data-sp2-ncopy>🤝 ${esc(i18n('Copie à envoyer au notaire…'))}</button></div></div>
            <p class="muted">${esc(i18n('Un fichier que le notaire ouvre d’un double-clic, sans rien pouvoir modifier, chiffré si tu le veux.'))}</p>
            ${(D.p2?.notary_copies || []).length ? `<p>${D.p2.notary_copies.map(x => badge(`v${x.v} · ${fmtDate(String(x.at).slice(0, 10))}${x.encrypted ? ' 🔐' : ''}`, 'violet')).join(' ')}</p>` : ''}</section>`, 'notary');
        return box;
    }

    /* ═════ 15. 📦 Archive de fin de dossier ═════ */
    const archMode = () => SP.protected() ? 'required' : cfg().archive_password; // 🔐 généalogie protégée : jamais d'archive en clair
    SP.archiveExtraHtml = D => {
        const mode = archMode();
        return `<div class="sp2-archive"><p><b>${esc(i18n('Part aussi'))}</b> : ${esc(i18n('📞 échanges · 💶 fonds · ⚰️ vérifications INSEE · 🧾 copie des factures (le registre, lui, ne change pas)'))}</p>
            ${mode === 'none' ? '' : `${mode === 'required' ? `<p><b>🔐 ${esc(i18n('Mot de passe (obligatoire)'))}</b></p>${SP.protected() ? `<p class="ui-hint">${esc(i18n('Cette généalogie est protégée par un mot de passe : ce qui en sort est toujours chiffré.'))}</p>` : ''}` : ck(i18n('🔐 Mot de passe'), 'name="arch_pw_on"', true)}
            <div class="succ-2" data-sp2-archpw><label>${esc(i18n('Mot de passe'))}<input type="password" name="arch_pw" autocomplete="new-password" minlength="8"></label><label>${esc(i18n('Encore une fois'))}<input type="password" name="arch_pw2" autocomplete="new-password"></label></div>
            <p class="ui-hint">${esc(i18n('AES-256, comme les sauvegardes protégées. Oublié = archive perdue. Le réimport le demande.'))} ${setLink('archive_password')}</p>`}</div>`;
    };
    SP.archivePassword = f => {
        const mode = archMode(); if (mode === 'none') return '';
        if (mode !== 'required' && !f.arch_pw_on?.checked) return '';
        const a = f.arch_pw?.value || '', b = f.arch_pw2?.value || '';
        if (a.length < 8) { UI().fail(f.arch_pw, i18n('Mot de passe trop court (8 caractères au moins).')); return false; }
        if (a !== b) { UI().fail(f.arch_pw2, i18n('Les deux mots de passe ne sont pas les mêmes.')); return false; }
        return a;
    };
    SP.askArchivePassword = () => new Promise(res => {
        let done = false;
        ext.openDialog({eyebrow: '🔐', title: i18n('Mot de passe de l’archive'), submitLabel: i18n('Ouvrir'),
            body: `<label>${esc(i18n('Mot de passe'))}<input type="password" name="pw" autocomplete="off"></label>`,
            onOpen: d => d.addEventListener('close', () => { if (!done) res(''); }),
            onSubmit: f => { done = true; res(f.pw.value); }});
    });

    /* ═════ 🙈 Mode écran partagé : initiales ou numéros, adresses et montants masqués, sans sortir du dossier ═════ */
    const SKEY = 'lcnda-succ-share';
    const shareOn = () => { try { return sessionStorage.getItem(SKEY) === '1'; } catch (_) { return false; } };
    let obs = null;
    function maskPage() {
        const page = document.querySelector('.succ-page'); if (!page) return;
        const set = cfg(), ids = new Map(); let n = 0;
        const nm = el => { const id = el.dataset.hPerson || el.dataset.succNode || el.textContent; if (!ids.has(id)) ids.set(id, ++n); return ids.get(id); };
        page.querySelectorAll('.succ-tabbody [data-h-person], [data-succ-tabbody] [data-h-person], .sp2-after [data-h-person], [data-sp2-name]').forEach(el => {
            if (el.dataset.sp2Masked) return; el.dataset.sp2Orig = el.textContent; el.dataset.sp2Masked = '1'; el.textContent = C().maskName(el.textContent, set.share_names, nm(el));
        });
        page.querySelectorAll('[data-succ-tabbody] .succ-node text, [data-succ-tabbody] svg text').forEach(el => { if (el.dataset.sp2Masked) return; el.dataset.sp2Orig = el.textContent; el.dataset.sp2Masked = '1'; el.textContent = C().maskName(el.textContent, set.share_names, nm(el)); });
        page.querySelectorAll('.succ-serial-addr, .sp2-addr, [data-succ-tabbody] td small').forEach(el => { if (/\d{5}|\brue\b|\bav\.|avenue|allée|place/i.test(el.textContent) && !el.dataset.sp2Masked) { el.dataset.sp2Orig = el.textContent; el.dataset.sp2Masked = '1'; el.textContent = '•••'; } });
        if (set.share_amounts === 'yes') {
            const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
            const hits = []; while (w.nextNode()) { const t = w.currentNode; if (/€/.test(t.nodeValue) && !t.parentElement.closest('input,textarea')) hits.push(t); }
            hits.forEach(t => { const m = C().maskAmounts(t.nodeValue); if (m !== t.nodeValue) { if (t.parentElement.dataset.sp2OrigText == null) t.parentElement.dataset.sp2OrigText = t.parentElement.innerHTML; t.nodeValue = m; } });
        }
        document.body.classList.add('sp2-sharing');
    }
    function setShare(on) {
        try { on ? sessionStorage.setItem(SKEY, '1') : sessionStorage.removeItem(SKEY); } catch (_) {}
        document.body.classList.toggle('sp2-sharing', on);
        if (on) { maskPage(); if (!obs) { obs = new MutationObserver(() => { clearTimeout(obs._t); obs._t = setTimeout(maskPage, 30); }); const w = document.getElementById('workspace'); if (w) obs.observe(w, {childList: true, subtree: true}); } toast(i18n('🙈 Écran partagé : noms, adresses et montants masqués')); }
        else { obs?.disconnect(); obs = null; ext.successoral?.forget?.(); document.querySelector('.succ-page') && ext.successoral?.render?.(); }
    }
    SP.shareOn = shareOn; SP.maskPage = maskPage;

    /* ═════ Les clics ═════ */
    document.addEventListener('click', async e => {
        const t = e.target; if (!t.closest || hidden()) return;
        if (t.closest('[data-sp2-delays]')) { e.preventDefault(); t.closest('details')?.removeAttribute('open'); return delaysDialog(); }
        const mp = t.closest('[data-sp2-map]'); if (mp) { e.preventDefault(); t.closest('details')?.removeAttribute('open'); return mapDialog(Number(mp.dataset.sp2Map) || 0); }
        const D = cur(); if (!D || !t.closest('.succ-page, dialog')) return;
        const R = ext.successoral?.currentR?.();
        if (t.closest('[data-sp2-share]')) { const on = !shareOn(); t.closest('details')?.removeAttribute('open'); setShare(on); return reload(); }
        if (t.closest('[data-sp2-insee]')) return inseeDialog(D);
        if (t.closest('[data-sp2-q]')) return qDialog(D, R);
        if (t.closest('[data-sp2-q-import]')) return qImport(D);
        if (t.closest('[data-sp2-q-paper]')) return qPaper(D, R);
        if (t.closest('[data-sp2-call-new]')) return callDialog(D);
        const cf = t.closest('[data-sp2-call-for]'); if (cf) return callDialog(D, null, Number(cf.dataset.sp2CallFor));
        const ce = t.closest('[data-sp2-call-edit]'); if (ce) { const c = (D.p2?.calls || []).find(x => x.id === Number(ce.dataset.sp2CallEdit)); if (c) callDialog(D, c); return; }
        const cd = t.closest('[data-sp2-call-del]'); if (cd) { const id = Number(cd.dataset.sp2CallDel); try { await post({op: 'p2_call_delete', case_id: D.id, id}); } catch (err) { return toast(err.message, 'error'); } A().undoToast(i18n('Échange mis à la corbeille'), {undo: async () => { await post({op: 'p2_call_restore', case_id: D.id, id}); reload(); }}); return reload(); }
        const rc = t.closest('[data-sp2-rec]'); if (rc && t.closest('.succ-page')) return recDialog(D, Number(rc.dataset.sp2Rec));
        if (t.closest('[data-sp2-imp-add]')) return impDialog(D);
        const ie = t.closest('[data-sp2-imp-edit]'); if (ie) { const x = D.deadlines.find(y => y.id === Number(ie.dataset.sp2ImpEdit)); if (x) impDialog(D, x); return; }
        const P_ = R && !R.error ? (ext.successoral?.S?.() || S()).pieces(R, D.graph, {acts: D.acts || {}, states: Object.fromEntries(Object.entries(D.pieces || {}).filter(([, p]) => p.state).map(([k, p]) => [k, p.state])), asked: D.asked || {}}) : null;
        if (t.closest('[data-sp2-proof]') && P_) return proofDialog(D, R, P_);
        if (t.closest('[data-sp2-group]') && P_) return groupDialog(D, R, P_);
        const is = t.closest('[data-sp2-issued]'); if (is && P_) { const it = P_.list.find(i => i.key === is.dataset.sp2Issued); return issuedDialog(D, is.dataset.sp2Issued, it?.what || is.dataset.sp2Issued); }
        const rs = t.closest('[data-sp2-research]'); if (rs) return researchDialog(D, Number(rs.dataset.sp2Research));
        const lk = t.closest('[data-sp2-link-case]'); if (lk) return linkCase(D, Number(lk.dataset.sp2LinkCase));
        if (t.closest('[data-sp2-merge]')) { t.closest('details')?.removeAttribute('open'); return mergeDialog(D); }
        if (t.closest('[data-sp2-merge-undo]')) { t.closest('details')?.removeAttribute('open'); try { await post({op: 'p2_merge_undo', into: D.id}); } catch (err) { return toast(err.message, 'error'); } toast(i18n('Fusion annulée : les deux dossiers sont séparés comme avant')); return reload(); }
        if (t.closest('[data-sp2-ncopy]') && SP.notaryCopyDialog) return SP.notaryCopyDialog(D, R, P_);
    });

    /* ═════ Au départ : les réglages, mode consultation : rien ═════ */
    const start = () => { if (hidden() || window.GENEALOGY_READY === false) return; loadSettings().then(() => { if (shareOn()) setShare(true); }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
