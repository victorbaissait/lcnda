/**
 * 🏛 Cet acte est-il en ligne aux archives ? — les pastilles (serveur : lib/archives_dispo.php ; maquette validée :
 * docs/design/archives-en-ligne.html). Naissance, baptême, mariage, décès, sépulture :
 *   🟢 En ligne · 🟡 Peut-être en ligne · 📮 À demander (et À QUI : mairie, Archives départementales, Service central
 *   d'état civil, ANOM, archives diocésaines…) · 🔒 Réservé jusqu'en <année> · ❔ À vérifier.
 * Jamais 🟢 sans limite sourcée et vérifiée (config/archives-en-ligne.json, ou ✓ de la personne). L'app n'interroge
 * jamais les sites des archives : elle ouvre la page, c'est la personne qui regarde.
 *
 * Où : la fiche (à côté de chaque date, dès le départ), « Pourquoi cette pastille ? » (source, date de vérification,
 * L213-2 sur Légifrance), ✓ Je l'ai trouvé en ligne / ✗ Pas en ligne (tout le département, ou seulement cette commune ;
 * ↶ Annuler), la Chronologie et la liste des Événements (à cocher dans Réglages → 🏛 Actes en ligne aux archives),
 * 🌍 Où chercher ? (« Ses actes aux archives »), 📮 Actes à demander (Registre de courriers), 📑 Pièces d'un dossier de
 * succession, widget « 🏛 Actes en ligne à aller voir ». ⓘ « Les séries, c’est quoi ? » : heritage-series-archives.js. Mode consultation : rien (lecture seule, pastilles cachées).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const UI = () => window.LCNDA_UI || {};
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const plural = (n, w, pl) => (A()?.plural ? A().plural(n, w, pl) : `${n} ${n > 1 ? (pl || w + 's') : w}`);
    const api = (...a) => A().api(...a);
    const write = body => api('ad_write', {}, {method: 'POST', body});
    const kiosk = () => document.body.classList.contains('is-kiosk');
    const S = () => A()?.state || {};
    const LEGI = 'https://www.legifrance.gouv.fr/search/code?tab_selection=code&searchField=ALL&query=L213-2%20code%20du%20patrimoine&page=1&init=true';
    const LEGI_DECRET = 'https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=d%C3%A9cret%202017-890&page=1&init=true';

    /* ═════ réglages (Réglages → 🏛 Actes en ligne aux archives) : la fiche dès le départ, le reste à cocher ═════ */
    const KEY = 'lcnda-archives-dispo';
    const cfg = () => { let v = {}; try { v = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {} return {fiche: v.fiche !== false, chrono: !!v.chrono, lists: !!v.lists, hideLinked: !!v.hideLinked, widgetSosa: !!v.widgetSosa}; };
    const setCfg = patch => { try { localStorage.setItem(KEY, JSON.stringify({...cfg(), ...patch})); } catch (_) {} };

    /* ═════ les pastilles ═════ */
    const STATUS = {online: ['🟢', 'En ligne', 'green'], maybe: ['🟡', 'Peut-être en ligne', 'yellow'], ask: ['📮', 'À demander', 'blue'], restricted: ['🔒', 'Réservé', 'grey'], verify: ['❔', 'À vérifier', 'grey']};
    const WHO = {mairie: ['📮', 'Mairie'], ad: ['🏛', 'Archives départementales'], scec: ['🌍', 'Service central d’état civil (Nantes)'], shd: ['🎖', 'Service historique de la Défense'],
        anom: ['⚓', 'Archives nationales d’outre-mer (Aix-en-Provence)'], diocese: ['⛪', 'Archives diocésaines'], notaire: ['🏛', 'Notaire ou Archives départementales (série E)']};
    const ACT = {BIRT: 'Naissance', CHR: 'Baptême', BAPM: 'Baptême', MARR: 'Mariage', DEAT: 'Décès', BURI: 'Sépulture'};
        const ACTS_LOW = {N: 'naissances', M: 'mariages', D: 'décès', TD: 'tables décennales', BMS: 'registres paroissiaux'};
    const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
    const actsName = k => cap(i18n(ACTS_LOW[k] || k));
    const cache = new Map(); // id d'événement → pastille
    const whoLabel = st => {
        if (!st.who || !WHO[st.who]) return '';
        if (st.who === 'mairie' && st.commune) return i18n('Mairie de {commune}', {commune: st.commune});
        if (st.who === 'ad' && st.dept) return i18n('Archives départementales ({dept})', {dept: st.dept.name});
        return i18n(WHO[st.who][1]);
    };
    const statusText = st => {
        if (st.status === 'restricted') return i18n('🔒 Réservé jusqu’en {year}', {year: Y(st.open_year)});
        if (st.status === 'ask' && st.who) return `${WHO[st.who]?.[0] || '📮'} ${i18n('À demander')}`;
        const s = STATUS[st.status] || STATUS.verify; return `${s[0]} ${i18n(s[1])}`;
    };
    /** la pastille (bouton : « Pourquoi cette pastille ? ») ; small : l'icône seule, le texte au survol */
    function badgeHtml(st, {small = false} = {}) {
        if (!st) return '';
        if (st.event_id) cache.set(st.event_id, st);
        const s = STATUS[st.status] || STATUS.verify, text = statusText(st), who = st.status === 'ask' || st.status === 'restricted' ? whoLabel(st) : '';
        const title = `${text}${who ? ` · ${who}` : ''}${st.linked ? ` · ${i18n('déjà lié à une source')}` : ''} — ${i18n('Pourquoi cette pastille ?')}`;
        if (st.linked && cfg().hideLinked) return '';
        return `<button type="button" class="ad-badge is-${esc(st.status)}${small || st.linked ? ' is-small' : ''}" data-ad-why="${Number(st.event_id) || 0}" title="${esc(title)}" aria-label="${esc(title)}">${small ? esc((st.status === 'ask' && st.who ? WHO[st.who]?.[0] : s[0]) || s[0]) : esc(text)}${st.linked ? ` <span class="ad-linked">${esc(i18n('✓ lié'))}</span>` : ''}${!small && who && st.status === 'ask' ? ` <span class="ad-who">· ${esc(who)}</span>` : ''}</button>`;
    }
    /** une ligne de texte (export CSV, colonne d'une liste) */
    const plainText = st => (st ? `${statusText(st)}${st.status === 'ask' && whoLabel(st) ? ` · ${whoLabel(st)}` : ''}` : '');
    async function loadEvents(ids) {
        const need = [...new Set(ids.map(Number).filter(i => i > 0 && !cache.has(i)))];
        for (let i = 0; i < need.length; i += 400) {
            const part = need.slice(i, i + 400);
            try { const r = await api('ad_events', {ids: part.join(',')}); Object.values(r.items || {}).forEach(st => cache.set(st.event_id, st)); part.forEach(id => { if (!cache.has(id)) cache.set(id, null); }); } catch (_) { return; }
        }
    }
    const refreshAll = () => { cache.clear(); const st = S(); if (st.module === 'personnes') A().setModule?.('personnes'); else if (st.module === 'listes') A().renderList?.(); else if (st.module === 'recherche') A().setModule?.('recherche'); else { document.querySelectorAll('#workspace [data-ad]').forEach(el => { el.removeAttribute('data-ad'); el.querySelectorAll('.ad-badge').forEach(b => b.remove()); }); scanSoon(); } };

    /* ═════ « Pourquoi cette pastille ? » ═════ */
    const fmtDay = d => { if (!d) return ''; const dt = new Date(`${String(d).slice(0, 10)}T12:00:00`); if (Number.isNaN(dt.getTime())) return String(d); const I = window.LCNDA_I18N; try { return I?.fmtDate ? I.fmtDate(dt, {day: 'numeric', month: 'long', year: 'numeric'}) : dt.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'}); } catch (_) { return String(d).slice(0, 10); } };
    const Y = v => String(v ?? '?'); // une année : jamais « 1 912 »
    const legiHtml = () => i18n('Règle : code du patrimoine, art. L213-2 ({legi}) ; qui peut demander avant : décret 2017-890, art. 30 ({decret}).', {legi: `<a href="${LEGI}" target="_blank" rel="noopener noreferrer">Légifrance ↗</a>`, decret: `<a href="${LEGI_DECRET}" target="_blank" rel="noopener noreferrer">Légifrance ↗</a>`});
    function reasonText(st) {
        const L = st.limit, r = st.range || [];
        const src = L?.source ? (() => { try { return new URL(L.source).hostname; } catch (_) { return L.source; } })() : '';
        switch (st.reason) {
            case 'limit': return i18n('Une limite vérifiée pour ce département et ce type d’acte couvre la date.');
            case 'unconfirmed': return L && L.confidence === 'secondaire' ? i18n('D’après une source secondaire ({source}) : à confirmer sur la page officielle des archives.', {source: src}) : i18n('Peut-être en ligne (d’après {source}, à confirmer) : année lue dans un extrait de recherche, pas encore confirmée.', {source: src || i18n('la table')});
            case 'straddle': return i18n('Date approximative : la fourchette {from}–{to} chevauche la limite ({until}).', {from: Y(r[0]), to: Y(r[1]), until: Y(L?.until)});
            case 'near': return i18n('La date est à 2 ans de la limite ({until}) : le registre est peut-être en ligne depuis.', {until: Y(L?.until)});
            case 'nolimit': return i18n('Acte de plus de 100 ans, mais la limite de ce département n’est pas encore vérifiée : jamais « en ligne » sans source.');
            case 'after': return i18n('Trop récent pour être en ligne : la limite de ce département est {until}.', {until: Y(L?.until)});
            case 'recent': return i18n('Trop récent pour être en ligne (et la limite de ce département n’est pas encore vérifiée).');
            case 'paris1860': return i18n('L’état civil parisien d’avant 1860 a brûlé en 1871 : chercher dans l’état civil reconstitué (Archives de Paris).');
            case 'religious': return i18n('Après 1792, un baptême ou une sépulture n’est pas dans l’état civil : il faut le demander aux archives diocésaines.');
            case 'before_from': return i18n('Les registres paroissiaux en ligne de ce département commencent en {from}.', {from: Y(L?.from)});
            case 'abroad': return st.who === 'anom' ? i18n('Ancienne colonie : l’état civil est aux Archives nationales d’outre-mer (Aix-en-Provence).') : i18n('Hors de France : la table ne couvre que les départements français. Pour un Français né, marié ou mort à l’étranger : le Service central d’état civil (Nantes).');
            case 'nodate': return i18n('Pas de date : impossible de la comparer avec la limite.');
            case 'noplace': return i18n('Pas de lieu : on ne sait pas à quelles archives s’adresser.');
            case 'nodept': return i18n('Le département du lieu n’est pas connu : choisis la commune dans la liste des lieux, le code arrive tout seul.');
            default: return '';
        }
    }
    function openWhy(eventId) {
        const st = cache.get(Number(eventId)); if (!st || !ext.openDialog) return;
        const L = st.limit, act = i18n(ACT[st.tag] || 'Acte');
        const lines = [];
        lines.push(`<p class="ad-why-status">${badgeHtml(st).replace('<button', '<span').replace('</button>', '</span>').replace(/ data-ad-why="\d+"/, '')}</p>`);
        lines.push(`<p>${esc(reasonText(st))}</p>`);
        if (st.dept) lines.push(`<p>${esc(i18n('Lieu : {place} → {dept} ({code}).', {place: st.place, dept: st.dept.name, code: st.dept.code}))}</p>`);
        if (st.key && st.dept) {
            if (L && L.until != null) {
                const head = i18n('Limite des {acts} ({dept}) : en ligne jusqu’en {until}', {acts: i18n(ACTS_LOW[st.key]), dept: st.dept.name, until: Y(L.until)});
                const src = L.source ? ` · <a href="${esc(L.source)}" target="_blank" rel="noopener noreferrer">${esc(i18n('la page qui le dit ↗'))}</a>` : '';
                const chk = L.checked ? ` · ${esc(i18n('vérifié le {date}', {date: fmtDay(L.checked)}))}` : '';
                const tag = L.verified && L.confidence === 'officielle' ? '' : ` <span class="ui-badge is-yellow">${esc(L.confidence === 'secondaire' ? i18n('source secondaire') : i18n('année lue dans un extrait de recherche, pas encore confirmée'))}</span>`;
                lines.push(`<p>${esc(head)}${src}${chk}${L.origin === 'lcnda' ? '' : ` <span class="ui-badge is-blue">${esc(i18n('corrigé par toi'))}</span>`}${tag}</p>`);
                (L.mine || []).forEach(m => lines.push(`<p class="muted">${esc(i18n({yes: '✓ D’après toi : trouvé en ligne ({year}){commune}, le {date}.', no: '✗ D’après toi : pas en ligne ({year}){commune}, le {date}.', limit: '＋ Limite notée par toi : {year}, le {date}.'}[m.verdict] || '', {year: Y(m.year), commune: m.commune ? ` — ${m.commune}` : '', date: fmtDay(m.date)}))}${m.about ? ` <small>(${esc(m.about)})</small>` : ''}</p>`));
            } else lines.push(`<p>${esc(i18n('Limite des {acts} ({dept}) : pas encore vérifiée.', {acts: i18n(ACTS_LOW[st.key]), dept: st.dept.name}))} <span class="ui-badge is-yellow">${esc(i18n('à vérifier'))}</span></p>`);
            if (st.dept.note) lines.push(`<p class="muted">${esc(st.dept.note)}</p>`);
        }
        if (st.open_at && (st.tag === 'BIRT' || st.tag === 'MARR')) lines.push(`<p>${esc(st.status === 'restricted' ? i18n('75 ans : acte de {date} → communicable à tous le {open}. Ce jour-là, la pastille devient « 📮 À demander » toute seule.', {date: st.date, open: fmtDay(st.open_at)}) : i18n('75 ans passés : l’acte est communicable à tous depuis le {open}.', {open: fmtDay(st.open_at)}))}</p>`);
        if (st.tag === 'DEAT' && (st.status === 'ask')) lines.push(`<p>${esc(i18n('Un acte de décès est communicable à tous, tout de suite.'))}</p>`);
        if (st.who && (st.status === 'ask' || st.status === 'restricted' || st.status === 'verify' || st.status === 'maybe')) lines.push(`<p><b>${esc(i18n('À qui demander :'))}</b> ${esc(WHO[st.who]?.[0] || '')} ${esc(whoLabel(st))}</p>`);
        lines.push(`<p class="muted">${legiHtml()}</p>`);
        if (ext.seriesArchives) lines.push(`<p class="muted">${ext.seriesArchives.link({site: st.site, name: st.dept?.service || ''})}</p>`); // 🗂 heritage-series-archives.js
        lines.push(`<p class="muted">${esc(i18n('L’app ne va pas voir sur le site des archives : elle ouvre la page, c’est toi qui regardes.'))}</p>`);
        const ro = kiosk();
        const acts = [];
        if (st.site) acts.push(`<a class="button small" href="${esc(st.site)}" target="_blank" rel="noopener noreferrer">${esc(i18n('🏛 Ouvrir les archives ({dept})', {dept: st.dept?.name || ''}))}</a>`);
        if (!ro && ext.openActLetter && st.who && st.status !== 'online') acts.push(`<button type="button" class="button small secondary" data-ad-letter="${st.event_id}">${esc(i18n('📮 Préparer la lettre ({who})', {who: whoLabel(st)}))}</button>`);
        if (!ro && st.key && st.dept && st.range) acts.push(`<button type="button" class="button small secondary" data-ad-yes="${st.event_id}">${esc(i18n('✓ Je l’ai trouvé en ligne'))}</button><button type="button" class="button small secondary" data-ad-no="${st.event_id}">${esc(i18n('✗ Pas en ligne'))}</button>`);
        if (st.status === 'verify' && ext.ouChercher?.openPerson) acts.push(`<button type="button" class="button small secondary" data-ad-ouc="${st.event_id}">${esc(i18n('🌍 Où chercher ?'))}</button>`);
        acts.push(`<button type="button" class="button small secondary" data-ad-table>${esc(i18n('🗂 Voir la table des limites'))}</button>`);
        const dlg = ext.openDialog({eyebrow: i18n('🏛 ARCHIVES EN LIGNE'), title: i18n('{act} : pourquoi cette pastille ?', {act}), submitLabel: i18n('Fermer'), onSubmit: () => true,
            body: `<div class="ad-why">${lines.join('')}<p class="ad-why-acts">${acts.join('')}</p></div>`});
        dlg?.addEventListener('click', e => {
            const b = e.target.closest('[data-ad-letter],[data-ad-yes],[data-ad-no],[data-ad-ouc],[data-ad-table]'); if (!b) return;
            e.preventDefault(); dlg.close?.();
            if (b.dataset.adLetter) openLetter(st);
            else if (b.dataset.adYes) openYes(st);
            else if (b.dataset.adNo) openNo(st);
            else if (b.dataset.adOuc) ext.ouChercher.openPerson(Number(S().currentPersonId) || 0);
            else openTable();
        });
    }
    function openLetter(st) {
        const act = {BIRT: 'naissance', CHR: 'naissance', BAPM: 'naissance', MARR: 'mariage', DEAT: 'deces', BURI: 'deces'}[st.tag] || 'naissance';
        const what = st.who === 'diocese' || st.who === 'ad' || st.who === 'anom' ? 'recherche' : st.who === 'scec' ? 'transcription' : 'integrale';
        ext.openActLetter?.({event_id: st.event_id, act, what, recipient: st.who || ''});
    }
    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-ad-why]'); if (!b) return;
        e.preventDefault(); e.stopPropagation(); openWhy(Number(b.dataset.adWhy));
    });

    /* ═════ ✓ Je l'ai trouvé en ligne · ✗ Pas en ligne (pour tout le département, ou seulement cette commune) ═════ */
    const contradict = (st, verdict) => {
        const L = st.limit; if (!L || L.origin !== 'lcnda' || !L.verified || L.until == null) return '';
        const y = verdict === 'no' ? st.range[0] : st.range[1];
        if ((verdict === 'no' && y <= L.until) || (verdict === 'yes' && y > L.until)) return UI().notice ? UI().notice('warn', `${esc(i18n('La page officielle disait {until} le {date}.', {until: Y(L.until), date: fmtDay(L.checked)}))} <a href="${esc(L.source)}" target="_blank" rel="noopener noreferrer">${esc(i18n('Rouvrir la page ↗'))}</a>`) : '';
        return '';
    };
    const about = st => `${i18n(ACT[st.tag] || 'Acte')} · ${st.date || st.range?.[0] || ''} · ${st.place || ''}`.slice(0, 200);
    async function save(body, msg) {
        let r; try { r = await write(body); } catch (e) { A().toast(e.message, 'error'); return false; }
        cache.clear();
        A().undoToast?.(msg, {undo: async () => { try { await write({op: 'undo', id: r.id}); } catch (e) { A().toast(e.message, 'error'); } refreshAll(); }});
        refreshAll();
        return true;
    }
    function openYes(st) {
        const y = st.range[1];
        ext.openDialog({eyebrow: i18n('🏛 ARCHIVES EN LIGNE'), title: i18n('✓ Trouvé en ligne'), submitLabel: i18n('Enregistrer'),
            body: `<p><b>${esc(about(st))}</b></p>${contradict(st, 'yes')}
                <label>${esc(i18n('Adresse de l’image de l’acte (facultatif, conseillé)'))}<input name="url" type="url" maxlength="500" placeholder="https://…" inputmode="url" autocomplete="off"></label>
                <label>${esc(i18n('Vue, page ou cote (facultatif)'))}<input name="page" maxlength="120" placeholder="${esc(i18n('ex. vue 143'))}"></label>
                <label class="checkbox-line"><input type="checkbox" name="add_source" checked> ${esc(i18n('Ajouter comme source de cet acte'))}</label>
                <fieldset class="ad-scope"><legend>${esc(i18n('Ta correction vaut pour…'))}</legend>
                    <label class="checkbox-line"><input type="radio" name="scope" value="dept" checked> ${esc(i18n('Tout le département : les {acts} ({dept}) sont en ligne au moins jusqu’en {year}', {acts: i18n(ACTS_LOW[st.key]), dept: st.dept.name, year: Y(y)}))}</label>
                    <label class="checkbox-line"><input type="radio" name="scope" value="commune"> ${esc(i18n('Seulement cette commune ({commune})', {commune: st.commune || st.place}))}</label></fieldset>`,
            onSubmit: async form => {
                const url = form.url.value.trim();
                if (url && !/^https?:\/\/\S+$/i.test(url)) { UI().fail?.(form.url, i18n('Cette adresse ne commence pas par https://')); return false; }
                return save({op: 'correct', event_id: st.event_id, verdict: 'yes', scope: form.scope.value, url, page: form.page.value.trim(), add_source: form.add_source.checked ? 1 : 0, about: about(st)},
                    i18n('✓ Noté : {acts} ({dept}) en ligne au moins jusqu’en {year}', {acts: i18n(ACTS_LOW[st.key]), dept: st.dept.name, year: Y(y)}));
            }});
    }
    function openNo(st) {
        ext.openDialog({eyebrow: i18n('🏛 ARCHIVES EN LIGNE'), title: i18n('✗ Pas en ligne'), submitLabel: i18n('Enregistrer'),
            body: `<p><b>${esc(about(st))}</b></p>${contradict(st, 'no')}<fieldset class="ad-scope"><legend>${esc(i18n('Pourquoi ?'))}</legend>
                <label class="checkbox-line"><input type="radio" name="why" value="dept" checked> <span><b>${esc(i18n('Le registre de cette année n’est pas en ligne'))}</b><br><small>${esc(i18n('La limite des {acts} ({dept}) passe avant {year} chez toi.', {acts: i18n(ACTS_LOW[st.key]), dept: st.dept.name, year: Y(st.range[0])}))}</small></span></label>
                <label class="checkbox-line"><input type="radio" name="why" value="commune"> <span><b>${esc(i18n('Seulement cette commune manque'))}</b><br><small>${esc(i18n('Exception pour {commune}, la limite du département ne bouge pas.', {commune: st.commune || st.place}))}</small></span></label>
                <label class="checkbox-line"><input type="radio" name="why" value="notfound"> <span><b>${esc(i18n('Je n’ai pas trouvé l’acte dans le registre'))}</b><br><small>${esc(i18n('La limite ne bouge pas ; c’est noté (« cherché, pas trouvé »).'))}</small></span></label></fieldset>`,
            onSubmit: async form => {
                const w = form.why.value;
                return save({op: 'correct', event_id: st.event_id, verdict: w === 'notfound' ? 'notfound' : 'no', scope: w === 'commune' ? 'commune' : 'dept', about: about(st)},
                    w === 'notfound' ? i18n('Noté : cherché, pas trouvé dans le registre') : i18n('✗ Noté : pas en ligne ({place})', {place: w === 'commune' ? (st.commune || st.place) : st.dept.name}));
            }});
    }

    /* ═════ 🗂 la table des limites (Réglages → 🏛 Actes en ligne aux archives) ═════ */
    function openTable() { const st = S(); st.maintenanceTab = 'archives_dispo'; A().persistUiState?.(); A().setModule?.('maintenance'); }
    ext.maintenance = ext.maintenance || {};
    ext.maintenance.archives_dispo = async token => {
        const ws = document.getElementById('workspace'); if (!ws) return;
        ws.innerHTML = `<section class="page">${UI().spinner ? UI().spinner(i18n('Chargement…')) : '…'}</section>`;
        let d; try { d = await api('ad_table'); } catch (e) { d = {error: e.message, rows: [], mine: []}; }
        if (token !== undefined && token !== S().workspaceToken) return;
        const c = cfg(), ro = kiosk();
        const tog = (k, label, hint) => `<label class="ui-toggle"><input type="checkbox" data-ad-cfg="${k}" ${c[k] ? 'checked' : ''} ${ro ? 'disabled' : ''}><i></i><span>${esc(i18n(label))}${hint ? `<small class="muted"> — ${esc(i18n(hint))}</small>` : ''}</span></label>`;
        let filter = 'all', q = '';
        ws.innerHTML = `<section class="page ad-page">${UI().pageHeader ? UI().pageHeader({where: 'Réglages · Recherche', title: 'Actes en ligne aux archives', help: 'Une pastille sur chaque naissance, baptême, mariage, décès et sépulture : en ligne, à demander (et à qui), réservé, à vérifier. Jamais « en ligne » sans une limite sourcée.'}) : ''}
            ${d.error ? UI().notice('error', esc(d.error)) : ''}
            <section class="maintenance-panel"><h3>${esc(i18n('Où montrer les pastilles'))}</h3>
                ${tog('fiche', 'Pastilles sur les fiches', 'à côté de chaque naissance, baptême, mariage, décès, sépulture')}
                ${tog('chrono', 'Pastilles dans la Chronologie')}${tog('lists', 'Colonne « 🏛 Archives » dans la liste des Événements')}
                ${tog('hideLinked', 'Cacher la pastille quand l’acte est déjà lié', 'sinon : petite « 🟢 ✓ lié »')}
                ${tog('widgetSosa', 'Widget « 🏛 Actes en ligne à aller voir » : ancêtres directs seulement')}</section>
            <section class="maintenance-panel"><h3>${esc(i18n('🗂 Archives en ligne par département'))}</h3>
                <p class="muted">${esc(d.present ? i18n('Table livrée avec l’app (vérifiée le {date}), complétée par tes corrections. Une ligne sans source n’existe pas : le département est alors « à vérifier ».', {date: fmtDay(d.generated)}) : i18n('La table des limites n’est pas encore livrée avec cette version : tout est « à vérifier », sauf ce que tu notes toi-même.'))}</p>
                <div class="ad-tools"><div class="segmented" role="group">${[['all', 'Tous'], ['ok', 'Vérifiés'], ['todo', 'À vérifier'], ['mine', 'Corrigés par moi']].map(([k, l]) => `<button type="button" data-ad-f="${k}" class="${k === 'all' ? 'is-active' : ''}">${esc(i18n(l))}</button>`).join('')}</div>
                    <input type="search" data-ad-q placeholder="${esc(i18n('🔎 Département…'))}" aria-label="${esc(i18n('Département'))}"></div>
                <div class="data-table-wrap"><table class="data-table ad-table" data-cols-off><thead><tr><th>${esc(i18n('Département'))}</th><th>${esc(i18n('Type d’acte'))}</th><th>${esc(i18n('En ligne jusqu’à'))}</th><th>${esc(i18n('Page officielle qui le dit'))}</th><th>${esc(i18n('Vérifié le'))}</th><th>${esc(i18n('Par'))}</th><th></th></tr></thead><tbody data-ad-rows></tbody></table></div>
                <p class="ui-hint">${esc(i18n('↔ Faire glisser le tableau.'))}</p>
                <p class="muted">${legiHtml()}</p></section></section>`;
        const rowsEl = ws.querySelector('[data-ad-rows]');
        const paint = () => {
            const out = [];
            const fq = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            (d.rows || []).filter(r => !q || fq(`${r.code} ${r.name}`).includes(fq(q))).forEach(r => {
                const acts = Object.entries(r.acts || {});
                const ok = acts.some(([, l]) => l.confirmed != null), mine = acts.some(([, l]) => l.origin !== 'lcnda');
                if ((filter === 'ok' && !ok) || (filter === 'todo' && acts.length) || (filter === 'mine' && !mine)) return;
                if (!acts.length) { out.push(`<tr><td><b>${esc(r.code)} · ${esc(r.name)}</b></td><td>${esc(i18n('tous'))}</td><td><span class="ui-badge is-yellow">${esc(i18n('à vérifier'))}</span></td><td>—</td><td>—</td><td>—</td><td>${ro ? '' : `<button type="button" class="button small secondary" data-ad-add="${esc(r.code)}" title="${esc(i18n('＋ Noter la limite'))}" aria-label="${esc(i18n('＋ Noter la limite'))}">＋</button>`}</td></tr>`); return; }
                acts.forEach(([k, l], i) => out.push(`<tr><td>${i ? '' : `<b>${esc(r.code)} · ${esc(r.name)}</b>`}</td><td>${esc(actsName(k))}</td>
                    <td>${l.until != null ? esc(l.until) : '—'}${l.from != null ? ` <small class="muted">(${esc(i18n('depuis {y}', {y: Y(l.from)}))})</small>` : ''}${l.confirmed == null ? ` <span class="ui-badge is-yellow">${esc(l.confidence === 'secondaire' ? i18n('source secondaire') : i18n('à confirmer'))}</span>` : ''}</td>
                    <td>${l.source ? `<a href="${esc(l.source)}" target="_blank" rel="noopener noreferrer">${esc(l.source.replace(/^https?:\/\//, '').slice(0, 48))}</a>` : '—'}</td><td>${esc(l.checked ? String(l.checked).slice(0, 10) : (l.mine?.length ? String(l.mine[l.mine.length - 1].date) : '—'))}</td>
                    <td>${l.origin === 'lcnda' ? 'LCNDA' : `${esc(i18n('moi'))}${(l.mine || []).map(m => ` <small class="muted">${esc(m.about || '')}</small>`).join('')}`}</td>
                    <td>${ro ? '' : `${(l.mine || []).map(m => `<button type="button" class="button small secondary" data-ad-undo="${m.id}" title="${esc(i18n('Retirer ma correction'))}">↶</button>`).join('')}${i ? '' : `<button type="button" class="button small secondary" data-ad-add="${esc(r.code)}" title="${esc(i18n('＋ Noter la limite'))}" aria-label="${esc(i18n('＋ Noter la limite'))}">＋</button>`}`}</td></tr>`));
            });
            rowsEl.innerHTML = out.join('') || `<tr><td colspan="7">${esc(i18n('Aucun département ne correspond.'))}</td></tr>`;
        };
        paint();
        ws.querySelector('.ad-page').addEventListener('change', e => { const k = e.target.dataset?.adCfg; if (!k) return; setCfg({[k]: e.target.checked}); cache.clear(); });
        ws.querySelector('[data-ad-q]').addEventListener('input', e => { q = e.target.value; paint(); });
        ws.querySelector('.ad-page').addEventListener('click', async e => {
            const f = e.target.closest('[data-ad-f]'); if (f) { filter = f.dataset.adF; ws.querySelectorAll('[data-ad-f]').forEach(b => b.classList.toggle('is-active', b === f)); paint(); return; }
            const u = e.target.closest('[data-ad-undo]'); if (u) { try { await write({op: 'undo', id: Number(u.dataset.adUndo)}); A().toast(i18n('Correction retirée : la ligne livrée avec l’app revient.'), 'success'); } catch (err) { A().toast(err.message, 'error'); } ext.maintenance.archives_dispo(S().workspaceToken); return; }
            const add = e.target.closest('[data-ad-add]'); if (add) addLimit(add.dataset.adAdd, (d.rows || []).find(r => r.code === add.dataset.adAdd)?.name || '');
        });
    };
    function addLimit(code, name) {
        ext.openDialog({eyebrow: i18n('🏛 ARCHIVES EN LIGNE'), title: i18n('＋ Noter la limite'), submitLabel: i18n('Enregistrer'),
            body: `<p><b>${esc(name)} (${esc(code)})</b></p><label>${esc(i18n('Type d’acte'))}<select name="act">${Object.keys(ACTS_LOW).map(k => `<option value="${k}">${esc(actsName(k))}</option>`).join('')}</select></label>
                <label>${esc(i18n('En ligne jusqu’à l’année'))}<input name="year" inputmode="numeric" maxlength="4" placeholder="${esc(i18n('ex. 1925'))}"></label>
                <label>${esc(i18n('Adresse de la page qui le dit (obligatoire)'))}<input name="url" type="url" maxlength="500" placeholder="https://…" inputmode="url" autocomplete="off"></label>
                <p class="ui-hint">${esc(i18n('Sans adresse, on ne peut pas enregistrer : c’est ce qui évite les limites inventées.'))}</p>`,
            onSubmit: async form => {
                const y = Number(form.year.value), url = form.url.value.trim();
                if (!(y >= 1500 && y <= new Date().getFullYear())) { UI().fail?.(form.year, i18n('Une année entre 1500 et aujourd’hui.')); return false; }
                if (!/^https?:\/\/\S+$/i.test(url)) { UI().fail?.(form.url, i18n('L’adresse de la page qui le dit est obligatoire.')); return false; }
                let r; try { r = await write({op: 'limit', dept: code, act: form.act.value, year: y, url}); } catch (e) { A().toast(e.message, 'error'); return false; }
                A().undoToast?.(i18n('＋ Limite notée : {dept}, {year}', {dept: name, year: Y(y)}), {undo: async () => { await write({op: 'undo', id: r.id}); ext.maintenance.archives_dispo(S().workspaceToken); }});
                cache.clear(); ext.maintenance.archives_dispo(S().workspaceToken); return true;
            }});
    }

    /* ═════ la fiche : une pastille à côté de chaque date ═════ */
    ext.afterPerson = ext.afterPerson || [];
    ext.afterPerson.push(async detail => {
        const pid = Number(detail?.person?.id); if (!pid || kiosk() || !cfg().fiche || detail.person.kind === 'animal') return;
        let r; try { r = await api('ad_person', {id: pid}); } catch (_) { return; }
        (r.items || []).forEach(st => {
            cache.set(st.event_id, st);
            document.querySelectorAll(`#workspace .event-row[data-event-id="${st.event_id}"] .event-date`).forEach(el => { if (el.querySelector('.ad-badge')) return; el.insertAdjacentHTML('beforeend', ` ${badgeHtml(st)}`); });
        });
    });

    /* ═════ Chronologie, 📑 pièces d'un dossier de succession : on décore ce qui est affiché ═════ */
    let scanT = 0;
    const scanSoon = () => { clearTimeout(scanT); scanT = setTimeout(scan, 120); };
    async function scan() {
        if (kiosk()) return;
        const c = cfg();
        const tl = c.chrono ? [...document.querySelectorAll('#workspace .timeline-row[data-event-id]:not([data-ad]), #workspace .timeline-card-line[data-event-id]:not([data-ad])')] : [];
        const pieces = [...document.querySelectorAll('#workspace [data-succ-ev]:not([data-ad])')];
        const ids = [...tl, ...pieces].map(el => Number(el.dataset.eventId || el.dataset.succEv)).filter(Boolean);
        if (!ids.length) return;
        [...tl, ...pieces].forEach(el => { el.dataset.ad = '1'; });
        await loadEvents(ids);
        tl.forEach(el => { const st = cache.get(Number(el.dataset.eventId)); if (st) (el.querySelector('.timeline-content, strong') || el).insertAdjacentHTML('beforeend', ` ${badgeHtml(st, {small: true})}`); });
        pieces.forEach(el => {
            const st = cache.get(Number(el.dataset.succEv)); if (!st) return;
            const cell = el.querySelector('[data-succ-act-cell]') || el.children[1]; if (!cell) return;
            const state = el.dataset.succState || '';
            let extra = '';
            if (st.status === 'online' && state !== 'have') extra = `<br><small>${esc(i18n('En ligne aux archives : à télécharger, pas à demander'))}</small>${st.site ? ` <a class="link-button" href="${esc(st.site)}" target="_blank" rel="noopener noreferrer">${esc(i18n('🏛 Ouvrir'))}</a>` : ''}`;
            else if ((st.status === 'ask' || st.status === 'restricted') && state === 'missing' && ext.openActLetter) extra = `<br><small>${esc(st.status === 'restricted' ? i18n('Réservé jusqu’en {year} : à demander par l’héritier lui-même, ou extrait sans filiation', {year: Y(st.open_year)}) : i18n('À demander : {who}', {who: whoLabel(st)}))}</small> <button type="button" class="link-button" data-ad-letter-ev="${st.event_id}">${esc(i18n('📮 Lettre'))}</button>`;
            cell.insertAdjacentHTML('beforeend', ` ${badgeHtml(st, {small: false})}${extra}`);
        });
    }
    document.addEventListener('click', e => { const b = e.target.closest?.('[data-ad-letter-ev]'); if (!b) return; e.preventDefault(); const st = cache.get(Number(b.dataset.adLetterEv)); if (st) openLetter(st); });
    const watch = () => { const ws = document.getElementById('workspace'); if (!ws) { setTimeout(watch, 300); return; } new MutationObserver(scanSoon).observe(ws, {childList: true, subtree: true}); };
    watch();

    /* ═════ la liste des Événements : une colonne « 🏛 Archives » (si cochée dans les Réglages) ═════ */
    function hookColumns() {
        const LC = ext.listColumns; if (!LC || LC._ad) return; LC._ad = true;
        const apply = LC.apply.bind(LC);
        LC.apply = (type, columns, rows) => {
            if (type !== 'events' || !cfg().lists || kiosk()) return apply(type, columns, rows);
            const missing = rows.map(r => Number(r.id)).filter(id => id && !cache.has(id));
            if (missing.length) loadEvents(missing.slice(0, 2000)).then(() => { if (S().module === 'listes' && S().listType === 'events') A().renderList?.(); });
            rows.forEach(r => { r.__v_ad = plainText(cache.get(Number(r.id))); });
            return apply(type, [...columns, [i18n('🏛 Archives'), '__v_ad']], rows);
        };
    }
    hookColumns(); document.addEventListener('DOMContentLoaded', hookColumns); setTimeout(hookColumns, 0);

    /* ═════ 🌍 Où chercher ? : « Ses actes aux archives » en tête de la page ═════ */
    const oucHook = async (view, body) => {
        if (kiosk() || !view?.pid) return;
        let r; try { r = await api('ad_person', {id: view.pid}); } catch (_) { return; }
        if (!body.isConnected || body.querySelector('.ad-ouc')) return;
        const items = (r.items || []).filter(st => !st.linked || !cfg().hideLinked);
        if (!items.length) return;
        items.forEach(st => cache.set(st.event_id, st));
        const line = st => `<li>${badgeHtml(st, {small: true})} <b>${esc(i18n(ACT[st.tag] || 'Acte'))}</b> ${esc(st.date || '')} <span class="muted">· ${esc(st.status === 'online' || st.status === 'maybe' ? (st.dept ? st.dept.service : '') : whoLabel(st) || reasonText(st))}</span>
            ${st.site && (st.status === 'online' || st.status === 'maybe') ? `<a class="link-button" href="${esc(st.site)}" target="_blank" rel="noopener noreferrer">${esc(i18n('🏛 Ouvrir'))}</a>` : ''}${st.status === 'maybe' && st.reason === 'straddle' ? ` <small class="muted">${esc(i18n('Commence par les tables décennales.'))}</small>` : ''}
            ${(st.status === 'ask' || st.status === 'restricted') && ext.openActLetter ? `<button type="button" class="link-button" data-ad-letter-ev="${st.event_id}">${esc(i18n('📮 Lettre'))}</button>` : ''}</li>`;
        const box = document.createElement('section');
        box.className = 'ad-ouc'; box.innerHTML = `<h4>${esc(i18n('Ses actes aux archives'))} ${ext.seriesArchives?.link() || ''}</h4><ul>${items.slice(0, 8).map(line).join('')}</ul>`;
        (body.querySelector('.ouc-facts') || body.firstChild)?.after(box);
    };
    const hookOuc = () => { const O = ext.ouChercher; if (!O) { setTimeout(hookOuc, 200); return; } O.afterRedraw = O.afterRedraw || []; if (!O.afterRedraw.includes(oucHook)) O.afterRedraw.push(oucHook); };
    hookOuc();

    /* ═════ le widget « 🏛 Actes en ligne à aller voir » ═════ */
    ext.dashboard = ext.dashboard || {};
    ext.dashboard.archives_online = {
        load: () => api('ad_counts', {sosa: cfg().widgetSosa ? 1 : 0}).catch(() => null),
        render: (index, widget, span, d) => {
            const body = !d ? (A().empty ? A().empty(i18n('Les actes n’ont pas pu être lus.'), {icon: '⛔'}) : '')
                : `<p class="ad-w-n"><b>${esc(i18n('{n} de ta base sont en ligne et pas encore liés à une source.', {n: plural(d.todo, 'acte', 'actes')}))}</b></p>
                    <ul class="ad-w-list">${[['N', 'naissances'], ['B', 'baptêmes'], ['M', 'mariages'], ['D', 'décès'], ['S', 'sépultures']].filter(([k]) => d.by?.[k]).map(([k, l]) => `<li>${esc(cap(i18n(l)))} : ${Number(d.by[k])}</li>`).join('')}</ul>
                    <p class="muted">${esc(i18n('Aussi : {maybe} peut-être en ligne · {ask} à demander · {verify} à vérifier', {maybe: `🟡 ${d.others?.maybe || 0}`, ask: `📮 ${(d.others?.ask || 0) + (d.others?.restricted || 0)}`, verify: `❔ ${d.others?.verify || 0}`}))}</p>
                    ${d.table ? '' : `<p class="ui-hint">${esc(i18n('La table des limites n’est pas encore livrée : aucun acte ne peut être « en ligne » sans source.'))}</p>`}`;
            return A().card(index, `🏛 ${i18n('Actes en ligne à aller voir')}`, d ? d.todo : '', `<div class="ad-widget">${body}</div>`, span,
                `<button type="button" class="button small secondary" data-ad-w-list>${esc(i18n('Voir la liste'))}</button>`);
        },
    };
    document.addEventListener('click', e => {
        if (!e.target.closest?.('[data-ad-w-list]')) return;
        e.preventDefault(); setCfg({lists: true}); const st = S(); st.listType = 'events'; A().persistUiState?.(); A().setModule?.('listes');
    });

    ext.archivesDispo = {badgeHtml, plainText, openWhy, statusText, whoLabel, reasonText, loadEvents, cache, cfg, setCfg, openTable, WHO};
})();
