/* LCNDA — 📺 SCÈNE : une série complète, façon IMDb (maquette X de docs/design/profils-et-oeuvres.html).
 * Série → saisons → épisodes, trois sortes de fiches du moteur reliées par parentField (series → season → episode),
 * avec les infos de chaque saison (années, responsable, coffret) et de chaque épisode (n°, 1re diffusion, durée, réalisation,
 * scénario 👤, invités 👤, lieux de tournage 📍, musique, vidéo, audience).
 * Sur la fiche de la série : le tableau des saisons, les épisodes de la saison choisie, et le panneau « 👤 X dans cette série » :
 * rôle (personnage, sorte de rôle) ou métier (scénariste, réalisatrice…), épisodes cochés EN LOT (« épisodes 2 à 7 », toute la
 * saison, toute la série, Maj+clic pour une plage), au générique, cachet. Rangé dans la série (data.participants) : la
 * personne y est indexée (item_people) et sa filmographie (heritage-scene-actor.js) montre « récurrente · S3 ép. 2-7 ».
 * Même modèle pour les émissions de télévision et de radio, podcasts, feuilletons radiophoniques, mangas et BD en volumes,
 * sagas de livres (cycle → tomes) : les mots s'adaptent (saison / cycle / volume, épisode / émission / tome).
 */
(() => {
    'use strict';
    const ART = window.LCNDA_ART, SC = ART?.scene; if (!ART?.define || !SC) return;
    const A = () => window.LCNDA_APP, P = () => window.LCNDA_PICKER || window.LCNDA_APP;
    const U = ART.util, esc = U.esc, fold = SC.fold;
    const plural = (n, w, pl) => U.plural(n, w, pl);
    const SKINDS = [['serie_tv', 'Série télévisée'], ['feuilleton', 'Feuilleton télévisé'], ['anime', 'Série animée'], ['webserie', 'Websérie'], ['emission_tv', 'Émission de télévision'], ['emission_radio', 'Émission de radio'],
        ['feuilleton_radio', 'Feuilleton radiophonique'], ['podcast', 'Podcast'], ['manga', 'Manga, BD en volumes'], ['saga', 'Saga de livres (cycle → tomes)'], ['autre', 'Autre']];
    const STATUS = [['', '—'], ['encours', 'en cours'], ['terminee', 'terminée'], ['annulee', 'arrêtée'], ['pause', 'en pause']];
    /** les mots de la série : saison / épisode, cycle / tome, émission… */
    const W = sk => ({manga: {s: 'série', S: 'Série', ss: 'séries', e: 'volume', es: 'volumes', E: 'Volume', ab: 'vol.'}, saga: {s: 'cycle', S: 'Cycle', ss: 'cycles', e: 'tome', es: 'tomes', E: 'Tome', ab: 't.'},
        emission_tv: {s: 'saison', S: 'Saison', ss: 'saisons', e: 'émission', es: 'émissions', E: 'Émission', ab: 'ém.'}, emission_radio: {s: 'saison', S: 'Saison', ss: 'saisons', e: 'émission', es: 'émissions', E: 'Émission', ab: 'ém.'}}[sk] || {s: 'saison', S: 'Saison', ss: 'saisons', e: 'épisode', es: 'épisodes', E: 'Épisode', ab: 'ép.'});
    SC.seriesWords = W;
    const RKINDS = [['principal', 'principal'], ['recurrent', 'récurrent'], ['invite', 'invité'], ['figuration', 'figuration'], ['cameo', 'caméo'], ['cascade', 'cascade'], ['voix', 'voix'], ['presentation', 'présentation'], ['autre', 'autre']];
    const JOBS = ['scénariste', 'réalisateur', 'réalisatrice', 'créateur', 'créatrice', 'compositeur', 'compositrice', 'producteur', 'productrice', 'monteur', 'monteuse', 'directeur de la photographie', 'chef décorateur', 'costumière', 'maquilleuse', 'ingénieur du son', 'technicien', 'technicienne', 'cascadeur', 'script', 'assistant réalisateur', 'présentateur', 'présentatrice', 'dessinateur', 'dessinatrice', 'traducteur', 'traductrice'];

    /* ═════════ Les liens de la chaîne ═════════ */
    const refId = v => U.ref(v)?.iid || 0;
    SC.seasonsOf = (store, sid) => store.of('season').filter(s => refId(s.data?.series) === Number(sid)).sort((a, b) => (Number(a.data?.no) || 999) - (Number(b.data?.no) || 999) || a.id - b.id);
    SC.episodesOf = (store, seasonId) => store.of('episode').filter(e => refId(e.data?.season) === Number(seasonId)).sort((a, b) => (Number(a.data?.no) || 9999) - (Number(b.data?.no) || 9999) || a.id - b.id);
    SC.seriesEpisodes = (store, sid) => { const ss = SC.seasonsOf(store, sid); return ss.flatMap(s => SC.episodesOf(store, s.id).map(e => ({e, s}))); };
    const sNo = s => s?.data?.no || '?', eNo = (s, e) => `${sNo(s)}×${String(e.data?.no || '?').padStart(2, '0')}`;
    const ranges = nums => { const l = [...new Set(nums.map(Number).filter(n => n > 0))].sort((a, b) => a - b), out = []; l.forEach(n => { const r = out[out.length - 1]; if (r && n === r[1] + 1) r[1] = n; else out.push([n, n]); }); return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', '); };
    /** « S3 ép. 2-7 (6 épisodes) » */
    SC.epsLabel = (store, series, ids) => { const set = new Set((ids || []).map(Number)); if (!set.size) return ''; const w = W(series?.data?.skind);
        const parts = SC.seasonsOf(store, series.id).map(s => { const nos = SC.episodesOf(store, s.id).filter(e => set.has(e.id)).map(e => e.data?.no || 0); return nos.length ? `S${sNo(s)} ${w.ab} ${ranges(nos) || '?'}` : ''; }).filter(Boolean);
        return `${parts.join(' · ')}${set.size > 1 ? ` (${plural(set.size, w.e, w.es)})` : ''}`; };
    const pkey = v => { const p = U.person(v); return p ? (p.pid ? `p${p.pid}` : `n${fold(p.txt)}`) : ''; };
    const partsOf = it => (Array.isArray(it?.data?.participants) ? it.data.participants : []).filter(p => p && U.person(p.who));

    /* ═════════ 📺 La série ═════════ */
    const STATE = new Map(); // par série : saison et épisode choisis, la personne du panneau, son brouillon
    const stOf = (store, sid) => { const k = `${store.pid}:${sid}`; if (!STATE.has(k)) STATE.set(k, {season: 0, ep: 0, who: null, mode: 'role', draft: null, filter: 'all', last: null}); return STATE.get(k); };
    function draftFor(store, it, st) {
        const who = st.who || {pid: Number(store.pid), title: store.name};
        const row = partsOf(it).find(p => pkey(p.who) === pkey(who) && (p.mode || 'role') === st.mode);
        return {who, mode: st.mode, saved: !!row, character: row?.character || '', rkind: row?.rkind || 'recurrent', job: row?.job || '', eps: new Set((row?.eps || []).map(Number)), credit: row?.credit || '', fee: row?.fee || '', note: row?.note || ''};
    }
    function treeHtml(store, it) {
        const st = stOf(store, it.id), w = W(it.data?.skind), seasons = SC.seasonsOf(store, it.id), mine = !it.person_id || it.person_id === store.pid;
        if (!st.draft || pkey(st.draft.who) !== pkey(st.who || {pid: store.pid}) || st.draft.mode !== st.mode) st.draft = draftFor(store, it, st);
        const D = st.draft, ctx = ART.ctx(store, it);
        if (!seasons.some(s => s.id === st.season)) { const withMe = seasons.find(s => SC.episodesOf(store, s.id).some(e => D.eps.has(e.id))); st.season = (withMe || seasons[0])?.id || 0; }
        const season = seasons.find(s => s.id === st.season), eps = season ? SC.episodesOf(store, season.id) : [];
        const whoName = U.nameOf(D.who) || store.name, whoShort = whoName.split(' ')[0];
        const sRows = seasons.map(s => { const l = SC.episodesOf(store, s.id), n = l.filter(e => D.eps.has(e.id)).length;
            return `<tr class="is-click ${s.id === st.season ? 'is-sel' : ''}" data-sc-season="${s.id}" tabindex="0"><td><b>${esc(sNo(s))}</b>${s.title && !/^(saison|cycle|série)\s*\d+$/i.test(s.title) ? ` <small class="ar-g">${esc(s.title)}</small>` : ''}</td><td>${esc(s.data?.dates || s.data?.year || '')}</td><td>${l.length || s.data?.eps_total || ''}${s.data?.eps_total && l.length && Number(s.data.eps_total) !== l.length ? ` <small class="ar-g">/ ${esc(s.data.eps_total)}</small>` : ''}</td><td>${U.nameOf(s.data?.showrunner) ? U.personChip(s.data.showrunner, '', ctx) : ''}</td><td>${esc(s.data?.dvd || '')}</td><td>${n ? `<span class="ar-badge b">${n}</span>` : ''}</td><td><button type="button" class="icon-button small" data-ar-open="${s.id}" title="Ouvrir la fiche de la ${esc(w.s)}">↗</button></td></tr>`; }).join('');
        const shown = st.filter === 'with' ? eps.filter(e => D.eps.has(e.id)) : eps;
        const epRows = shown.map(e => { const on = D.eps.has(e.id);
            return `<tr class="is-click ${on ? 'is-on' : ''} ${e.id === st.ep ? 'is-sel' : ''}" data-sc-ep="${e.id}"><td><input type="checkbox" data-sc-epchk="${e.id}" ${on ? 'checked' : ''} ${mine ? '' : 'disabled'} aria-label="${esc(whoName)} dans l’${esc(w.e)} ${esc(eNo(season, e))}" title="${esc(whoName)} dans cet ${esc(w.e)} (Maj+clic : toute une plage)"></td><td class="n">${esc(eNo(season, e))}</td><td>${on ? `<b>${esc(e.title)}</b>` : esc(e.title)}</td><td>${esc(SC.dayLabel(SC.dayOf(e.data?.date), 'short') || e.data?.date || '')}</td><td>${esc(e.data?.dur || '')}</td><td>${esc(U.nameOf(e.data?.director))}</td><td>${esc(e.data?.audience || '')}</td></tr>`; }).join('');
        const ep = eps.find(e => e.id === st.ep);
        const card = ep ? (() => { const d = ep.data || {}, line = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${v}</dd>` : '';
            const m = ART.mediaOf(d.video);
            return `<div class="sc-rcard"><div class="sc-rhd"><span class="sc-kind edit">${esc(w.E.toLocaleUpperCase('fr-FR'))} ${esc(eNo(season, ep))}</span><b>${esc(ep.title)}</b><span class="spacer"></span><button type="button" class="button small secondary" data-ar-open="${ep.id}">↗ Ouvrir</button>${mine ? `<button type="button" class="button small secondary" data-sc-editep="${ep.id}">✎ Modifier</button>` : ''}<button type="button" class="icon-button small" data-sc-epclose aria-label="Fermer" title="Fermer">×</button></div>
                <dl class="ar-dl ar-dl-s">${line('Titre original', esc(d.original || ''))}${line('1re diffusion', esc(d.date || ''))}${line('Scénario', ART.normPeople(d.writers).map(p => U.personChip(p, p.role, ctx)).join(''))}${line('Réalisation', U.personChip(d.director, '', ctx))}${line('Résumé', esc(String(d.synopsis || '').slice(0, 500)) + (String(d.synopsis || '').length > 500 ? '…' : ''))}
                ${line('Invités', ART.normPeople(d.guests).map(p => U.personChip(p, p.role, ctx)).join(''))}${line('Tournage', (d.places || []).map(r => U.placeChip(r.place)).join(''))}${line('Musique', (d.music || []).map(x => U.refChip(x, '🎵')).join(''))}${line('Vidéo', m ? ART.ft.media.read({}, d.video) : '')}${line('Avec', partsOf(it).filter(p => (p.eps || []).map(Number).includes(ep.id)).map(p => U.personChip(p.who, p.character || p.job, ctx)).join(''))}</dl></div>`; })() : '';
        const parts = partsOf(it), whoChips = [...new Map([[pkey({pid: store.pid}), {who: {pid: Number(store.pid), title: store.name}}], ...parts.map(p => [pkey(p.who), p])]).values()];
        const tot = D.eps.size, label = SC.epsLabel(store, it, [...D.eps]);
        const panel = `<aside class="sc-pan" data-sc-panel><div class="sc-ph"><b>👤 ${esc(whoName)} dans cette ${esc(it.data?.skind === 'manga' || it.data?.skind === 'saga' ? 'œuvre' : 'série')}</b></div>
            <div class="sc-pb"><div class="sc-who">${whoChips.map(p => `<button type="button" class="sc-wchip ${pkey(p.who) === pkey(D.who) ? 'is-active' : ''}" data-sc-who="${esc(pkey(p.who))}" title="${esc(U.nameOf(p.who))}">${esc(U.nameOf(p.who).split(' ')[0] || '?')}</button>`).join('')}${mine ? '<button type="button" class="sc-wchip is-add" data-sc-addwho>＋ Une personne…</button>' : ''}</div>
            <div class="ui-filters sc-modes" role="group" aria-label="Rôle ou métier"><button type="button" class="${D.mode === 'role' ? 'is-active' : ''}" data-sc-mode="role">🎭 Rôle</button><button type="button" class="${D.mode === 'job' ? 'is-active' : ''}" data-sc-mode="job">🛠 Métier</button></div>
            ${D.mode === 'role' ? `<label class="sc-fld"><span>Personnage</span><input class="ar-in" data-sp="character" value="${esc(D.character)}" placeholder="Mme Pichon, la concierge"></label>
                <label class="sc-fld"><span>Sorte de rôle</span><select class="ar-in" data-sp="rkind">${RKINDS.map(([k, l]) => `<option value="${k}" ${D.rkind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
                : `<label class="sc-fld"><span>Métier</span><input class="ar-in" data-sp="job" value="${esc(D.job)}" list="sc-jobs" placeholder="scénariste, réalisatrice, compositrice…"><datalist id="sc-jobs">${JOBS.map(j => `<option value="${esc(j)}">`).join('')}</datalist></label>`}
            <div class="sc-fld"><span>${esc(SC.cap(w.es))}</span><div class="sc-range">${esc(w.S)} <b>${esc(season ? sNo(season) : '—')}</b> · ${esc(w.es)} <input class="ar-in sc-n" data-sp-a inputmode="numeric" value="${esc(st.ra ?? '')}" placeholder="2" aria-label="du n°"> à <input class="ar-in sc-n" data-sp-b inputmode="numeric" value="${esc(st.rb ?? '')}" placeholder="7" aria-label="au n°"> <button type="button" class="button small secondary" data-sc-range ${season ? '' : 'disabled'}>Cocher</button></div>
                <div class="sc-lot"><button type="button" class="ar-linkbtn u" data-sc-all="season" ${season ? '' : 'disabled'}>toute la ${esc(w.s)}</button> · <button type="button" class="ar-linkbtn u" data-sc-all="series">toute la série</button> · <button type="button" class="ar-linkbtn u" data-sc-all="none">aucun</button></div>
                <small class="ar-g">${tot ? `${esc(plural(tot, `${w.e} coché`, `${w.es} cochés`))} : ${esc(label)}` : `ou coche-les dans la liste ☑ (Maj+clic : une plage)`}</small></div>
            <label class="sc-fld"><span>Au générique</span><input class="ar-in" data-sp="credit" value="${esc(D.credit)}" placeholder="${esc(whoName)}"></label>
            <label class="sc-fld"><span>Cachet par ${esc(w.e)}</span><input class="ar-in" data-sp="fee" value="${esc(D.fee)}" placeholder="1 200 F"></label>
            <label class="sc-fld"><span>Note</span><input class="ar-in" data-sp="note" value="${esc(D.note)}"></label>
            <p class="ar-note">Sur la fiche de ${esc(whoShort)} : « ${esc([D.mode === 'job' ? (D.job || 'métier') : (RKINDS.find(r => r[0] === D.rkind) || [, ''])[1], label].filter(Boolean).join(' · ') || '…')} ».</p></div>
            ${mine ? `<div class="sc-pf">${D.saved ? '<button type="button" class="button small secondary danger" data-sc-pdel>Retirer</button>' : ''}<span class="spacer"></span><button type="button" class="button small secondary" data-sc-pcancel>Annuler</button><button type="button" class="button small" data-sc-psave>💾 Enregistrer</button></div>` : ''}</aside>`;
        return `<div class="sc-tree"><div class="sc-tmain">
            <section class="ar-sec sc-flat"><div class="ar-sh"><small class="ar-g">${esc([seasons.length && plural(seasons.length, w.s, w.ss), it.data?.total_seasons && `sur ${it.data.total_seasons}`].filter(Boolean).join(' '))}</small><span class="spacer"></span>${mine ? `<button type="button" class="button small secondary" data-sc-addseason>＋ Ajouter une ${esc(w.s)}</button>` : ''}</div>
                ${seasons.length ? `<div class="ar-scroll"><table class="ar-t sc-seasons"><thead><tr><th>${esc(w.S)}</th><th>Années</th><th>${esc(SC.cap(w.es))}</th><th>Responsable</th><th>DVD, coffret</th><th>Avec ${esc(whoShort)}</th><th></th></tr></thead><tbody>${sRows}</tbody></table></div>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Pas encore de ${esc(w.s)} <small>Ajoute une ${esc(w.s)}, puis ses ${esc(w.es)}.</small></span>${mine ? `<button type="button" class="button small secondary" data-empty-click="[data-sc-addseason]">＋ Ajouter une ${esc(w.s)}</button>` : ''}</p>`}</section>
            ${season ? `<section class="ar-sec"><div class="ar-sh"><b>🎞 ${esc(w.S)} ${esc(sNo(season))} · ${esc(w.es)}</b><span class="spacer"></span><span class="ui-filters"><button type="button" class="${st.filter === 'all' ? 'is-active' : ''}" data-sc-filter="all">Tous ${eps.length}</button><button type="button" class="${st.filter === 'with' ? 'is-active' : ''}" data-sc-filter="with">Avec ${esc(whoShort)} ${eps.filter(e => D.eps.has(e.id)).length}</button></span>${mine ? `<button type="button" class="button small secondary" data-sc-addep>＋ Un ${esc(w.e)}</button><button type="button" class="button small secondary" data-sc-addeps>＋ Plusieurs…</button>` : ''}</div>
                ${eps.length ? `<div class="ar-scroll"><table class="ar-t sc-eps"><thead><tr><th></th><th>N°</th><th>Titre</th><th>1re diffusion</th><th>Durée</th><th>Réalisation</th><th>Audience</th></tr></thead><tbody>${epRows || `<tr><td colspan="7" class="muted">Aucun ${esc(w.e)} avec ${esc(whoShort)} dans cette ${esc(w.s)}.</td></tr>`}</tbody></table></div>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucun ${esc(w.e)} dans cette ${esc(w.s)} <small>« Plusieurs… » en ajoute d’un coup (numérotés).</small></span>${mine ? `<button type="button" class="button small secondary" data-empty-click="[data-sc-addeps]">＋ Plusieurs…</button>` : ''}</p>`}${card}</section>` : ''}
            </div>${panel}</div>`;
    }
    SC.treeHtml = treeHtml;
    ART.views.sc_series = {read: (ctx, it) => it.id ? `<div class="sc-series" data-sc-series="${it.id}">${treeHtml(ctx.store, it)}</div>` : '',
        text: (ctx, it) => { const ss = SC.seasonsOf(ctx.store, it.id), n = SC.seriesEpisodes(ctx.store, it.id).length, w = W(it.data?.skind); return [ss.length && plural(ss.length, w.s, w.ss), n && plural(n, w.e, w.es)].filter(Boolean).join(' · '); }};
    ART.views.sc_series_people = {read: (ctx, it) => { const l = partsOf(it); if (!l.length) return ''; return l.map(p => `<div class="sc-mline">${U.personChip(p.who, p.mode === 'job' ? p.job : p.character, ctx)} <small class="ar-g">${esc([p.mode === 'job' ? '' : (RKINDS.find(r => r[0] === p.rkind) || [, ''])[1], SC.epsLabel(ctx.store, it, p.eps)].filter(Boolean).join(' · '))}</small></div>`).join(''); },
        text: (ctx, it) => partsOf(it).map(p => `${U.nameOf(p.who)} (${[p.mode === 'job' ? p.job : p.character, SC.epsLabel(ctx.store, it, p.eps)].filter(Boolean).join(', ')})`).join(' · ')};
    ART.define({key: 'series', icon: '📺', label: 'Série, émission', many: 'Séries et émissions', fem: true, domain: 'film', tab: 'Séries',
        eyebrow: it => [(SKINDS.find(k => k[0] === it.data?.skind) || SKINDS[0])[1], it.data?.channel, it.data?.dates].filter(Boolean).join(' · '),
        heading: (ctx, it) => `<h2 class="ar-h2">${esc(it.title)}</h2>${it.data?.original && it.data.original !== it.title ? `<p class="ar-g">${esc(it.data.original)}</p>` : ''}`,
        cardLine: it => [it.data?.dates, it.data?.channel].filter(Boolean).join(' · '),
        newData: () => ({skind: 'serie_tv'}),
        groups: [
            {key: 'photos', label: 'Affiche', zone: 'left', fields: [{key: 'photos', label: 'Affiche, jaquette', type: 'photos', star: true, labels: [['affiche', 'Affiche'], ['jaquette', 'Jaquette'], ['photo', 'Photo'], ['autre', 'Autre']]}]},
            {key: 'main', label: 'La série', icon: '📺', zone: 'left', fields: [
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'original', label: 'Titre original', type: 'text', star: true, head: true},
                {key: 'skind', label: 'Sorte', type: 'select', choices: SKINDS, star: true}, {key: 'channel', label: 'Chaîne, station, éditeur', short: 'Chaîne', type: 'text', star: true, ph: 'RTF → ORTF → Antenne 2'},
                {key: 'country', label: 'Pays', type: 'text', star: true}, {key: 'genre', label: 'Genre', type: 'text', star: true, ph: 'policier, comédie…'},
                {key: 'creator', label: 'Création', type: 'sc_people', star: true, addLabel: 'Un créateur, une créatrice', rolePh: 'création, d’après…', roleWord: 'création'},
                {key: 'dates', label: 'Diffusion', type: 'text', star: true, ph: '1958 – 1996'}, {key: 'status', label: 'État', type: 'select', choices: STATUS, star: true},
                {key: 'total_seasons', label: 'Saisons en tout', type: 'number', star: true, help: '(même celles pas encore notées ici)'}, {key: 'total_eps', label: 'Épisodes en tout', type: 'number', star: true},
                {key: '_size', label: 'Ici', type: 'computed', view: 'sc_series_size', star: true},
                {key: 'ep_dur', label: 'Durée d’un épisode', type: 'text', star: false}, {key: 'producer', label: 'Production', type: 'text', star: false},
                {key: 'theme', label: 'Générique (musique)', type: 'item', kinds: ['track_work'], star: true}, {key: 'theme_sound', label: 'Générique (son)', type: 'media', media: ['audio', 'video'], star: false}]},
            {key: 'people', label: 'Qui y a fait quoi', icon: '👤', zone: 'left', fields: [{key: '_people', label: 'Personnes', type: 'computed', view: 'sc_series_people', star: true}]},
            {key: 'synopsis', label: 'Résumé', zone: 'main', fields: [{key: 'synopsis', label: 'Résumé', type: 'longtext', star: true, section: true}]},
            {key: 'tree', label: 'Saisons et épisodes', zone: 'main', fields: [{key: '_tree', label: 'Saisons et épisodes', secLabel: '📂 Saisons et épisodes', type: 'computed', view: 'sc_series', star: true}]},
            {key: 'ids', label: 'Identifiants et liens', icon: '🔢', zone: 'left', fields: [
                {key: 'imdb', label: 'IMDb', type: 'ident', href: v => /^tt\d+$/.test(v) ? `https://www.imdb.com/title/${v}/` : '', star: false, ph: 'tt0123456'},
                {key: 'tmdb', label: 'TMDb', type: 'ident', href: v => /^\d+$/.test(v) ? `https://www.themoviedb.org/tv/${v}` : '', star: false},
                {key: 'wikidata', label: 'Wikidata', type: 'ident', href: v => /^Q\d+$/.test(v) ? `https://www.wikidata.org/wiki/${v}` : '', star: false}, {key: 'link', label: 'Lien', type: 'url', star: false}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'left', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]},
            {key: '_linked', label: 'Lié à', icon: '🔗', zone: 'left', fields: [{key: '_linked', label: 'Fiches et personnes liées', type: 'computed', view: 'linked', star: true}]}],
        list: ['photos', 'title', 'skind', 'channel', 'dates', '_size'], card: ['dates', '_size'], export: ['title', 'original', 'skind', 'channel', 'country', 'genre', 'creator', 'dates', 'synopsis', '_people'],
        listExtra: [{key: '_size', label: 'Ici', type: 'computed', view: 'sc_series_size'}],
        filters: () => [{id: 'skind', label: 'Sorte', type: 'check', options: SKINDS, test: (it, v) => !v?.length || v.includes(it.data.skind || 'serie_tv')}],
    });
    ART.views.sc_series_size = {read: (ctx, it) => esc(ART.views.sc_series.text(ctx, it)), text: (ctx, it) => ART.views.sc_series.text(ctx, it)};
    ART.defs.series.scTab = store => store.of('series').length > 0;

    /* ═════════ 📂 La saison ═════════ */
    ART.views.sc_season = {read: (ctx, it) => { const l = SC.episodesOf(ctx.store, it.id), ser = ctx.store.get(refId(it.data?.series)), w = W(ser?.data?.skind), mine = !it.person_id || it.person_id === ctx.store.pid;
        const add = mine ? `<div class="ar-row"><button type="button" class="button small secondary" data-sc-addep="${it.id}">＋ Un ${esc(w.e)}</button><button type="button" class="button small secondary" data-sc-addeps="${it.id}">＋ Plusieurs…</button></div>` : '';
        return `${l.length ? `<div class="ar-scroll"><table class="ar-t sc-eps"><thead><tr><th>N°</th><th>Titre</th><th>1re diffusion</th><th>Durée</th><th>Réalisation</th></tr></thead><tbody>${l.map(e => `<tr class="is-click" data-ar-row-open="${e.id}"><td class="n">${esc(eNo(it, e))}</td><td>${esc(e.title)}</td><td>${esc(e.data?.date || '')}</td><td>${esc(e.data?.dur || '')}</td><td>${esc(U.nameOf(e.data?.director))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty-line"><span class="empty-line-ico" aria-hidden="true">📭</span><span class="empty-line-text">Aucun ${esc(w.e)}.</span></p>`}${add}`; },
        meta: (ctx, it) => { const n = SC.episodesOf(ctx.store, it.id).length, w = W(ctx.store.get(refId(it.data?.series))?.data?.skind); return n ? esc(plural(n, w.e, w.es)) : ''; },
        text: (ctx, it) => { const n = SC.episodesOf(ctx.store, it.id).length; return n ? plural(n, 'épisode') : ''; }};
    ART.define({key: 'season', icon: '📂', label: 'Saison', many: 'Saisons', fem: true, domain: 'film', parentField: 'series',
        eyebrow: (it, store) => { const s = store?.get?.(refId(it.data?.series)); return [`${W(s?.data?.skind).S} ${it.data?.no || ''}`.trim(), U.refTitle(it.data?.series)].filter(Boolean).join(' · '); },
        cardLine: it => [U.refTitle(it.data?.series), it.data?.dates].filter(Boolean).join(' · '),
        newData: () => ({}),
        groups: [
            {key: 'main', label: 'La saison', zone: 'main', fields: [
                {key: 'series', label: 'Série', type: 'item', kinds: ['series'], star: true, roleWord: 'saison'}, {key: 'no', label: 'N°', type: 'number', star: true},
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true, ph: 'Saison 3'}, {key: 'dates', label: 'Années', type: 'text', star: true, ph: '1966 – 1970'},
                {key: 'showrunner', label: 'Responsable', type: 'person', star: true, roleWord: 'responsable de saison'}, {key: 'eps_total', label: 'Épisodes prévus', type: 'number', star: false},
                {key: 'dvd', label: 'DVD, coffret', type: 'text', star: true, ph: 'coffret INA 3'}]},
            {key: 'eps', label: 'Épisodes', zone: 'main', fields: [{key: '_eps', label: '🎞 Épisodes', type: 'computed', view: 'sc_season', star: true}]},
            {key: 'synopsis', label: 'Résumé', zone: 'main', fields: [{key: 'synopsis', label: 'Résumé', type: 'longtext', star: true, section: true}]},
            {key: 'photos', label: 'Jaquette', zone: 'left', fields: [{key: 'photos', label: 'Jaquette, photos', type: 'photos', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['series', 'no', 'title', 'dates', '_eps'], card: ['series', 'dates'], export: ['series', 'no', 'title', 'dates', 'showrunner', 'dvd'],
        listExtra: [{key: '_eps', label: 'Épisodes', type: 'computed', view: 'sc_season'}],
        sorts: [['year', 'Par année'], ['az', 'A → Z'], ['perso', 'Mon ordre']],
        beforeSave: d => { if (!String(d.title || '').trim()) d.title = `Saison ${d.no || ''}`.trim(); },
    });
    ART.defs.season.scQuiet = true;

    /* ═════════ 🎞 L'épisode ═════════ */
    ART.views.sc_ep_people = {read: (ctx, it) => { const ser = ctx.store.get(refId(it.data?.series)); if (!ser) return ''; const l = partsOf(ser).filter(p => (p.eps || []).map(Number).includes(it.id)); if (!l.length) return '';
        return l.map(p => `<div class="sc-mline">${U.personChip(p.who, p.mode === 'job' ? p.job : p.character, ctx)}</div>`).join(''); }};
    ART.define({key: 'episode', icon: '🎞', label: 'Épisode', many: 'Épisodes', domain: 'film', parentField: 'season',
        eyebrow: (it, store) => { const s = store?.get?.(refId(it.data?.season)), ser = store?.get?.(refId(it.data?.series)); return [`${W(ser?.data?.skind).E} ${s ? eNo(s, it) : it.data?.no || ''}`.trim(), U.refTitle(it.data?.series)].filter(Boolean).join(' · '); },
        cardLine: it => [U.refTitle(it.data?.series), it.data?.date].filter(Boolean).join(' · '),
        groups: [
            {key: 'main', label: 'L’épisode', zone: 'main', fields: [
                {key: 'season', label: 'Saison', type: 'item', kinds: ['season'], star: true, roleWord: 'épisode'}, {key: 'series', label: 'Série', type: 'item', kinds: ['series'], star: true, help: '(se remplit d’après la saison)'},
                {key: 'no', label: 'N° dans la saison', type: 'number', star: true}, {key: 'abs', label: 'N° dans la série', type: 'number', star: false},
                {key: 'title', label: 'Titre', type: 'text', star: true, head: true}, {key: 'original', label: 'Titre original', type: 'text', star: true},
                {key: 'date', label: '1re diffusion', type: 'date', star: true}, {key: 'dur', label: 'Durée', type: 'text', star: true, ph: '1 h 30'},
                {key: 'director', label: 'Réalisation', type: 'person', star: true, roleWord: 'réalisation'},
                {key: 'writers', label: 'Scénario', type: 'sc_people', star: true, addLabel: 'Un ou une scénariste', rolePh: 'scénario, dialogues…', roleWord: 'scénario'},
                {key: 'guests', label: 'Invités', type: 'sc_people', star: true, addLabel: 'Un invité', rolePh: 'son personnage', roleWord: 'invité'},
                {key: 'audience', label: 'Audience', type: 'text', star: true, ph: '61 %'}]},
            {key: 'synopsis', label: 'Résumé', zone: 'main', fields: [{key: 'synopsis', label: 'Résumé', type: 'longtext', star: true, section: true}]},
            {key: 'shoot', label: 'Tournage, musique', zone: 'main', fields: [
                {key: 'places', label: 'Lieux de tournage', type: 'rows', star: true, addLabel: 'Un lieu', cols: [{key: 'place', label: 'Lieu', type: 'place', w: 'l'}, {key: 'note', label: 'Note', w: 'm'}]},
                {key: 'music', label: 'Musique', type: 'items', kinds: ['track_work'], star: true}]},
            {key: 'photos', label: 'Photos', zone: 'left', fields: [{key: 'photos', label: 'Photos', type: 'photos', star: true}]},
            {key: 'video', label: 'Vidéo', icon: '🎞', zone: 'left', fields: [{key: 'video', label: 'Vidéo', type: 'media', media: ['video', 'audio'], star: true}]},
            {key: 'who', label: 'Avec', icon: '👤', zone: 'right', fields: [{key: '_who', label: 'Avec', type: 'computed', view: 'sc_ep_people', star: true}]},
            {key: 'notes', label: 'Notes', icon: '📝', zone: 'right', fields: [{key: 'notes', label: 'Notes', type: 'longtext', star: true, bare: true}]}],
        list: ['series', 'season', 'no', 'title', 'date', 'director'], card: ['series', 'date'], export: ['series', 'season', 'no', 'title', 'date', 'dur', 'director', 'writers', 'guests', 'synopsis'],
        sorts: [['year', 'Par année'], ['az', 'A → Z'], ['perso', 'Mon ordre']],
        beforeSave: (d, store) => { const s = store?.get?.(refId(d.season)); if (s && !U.ref(d.series) && U.ref(s.data?.series)) d.series = s.data.series; if (!String(d.title || '').trim()) d.title = `Épisode ${d.no || ''}`.trim(); },
    });
    ART.defs.episode.scQuiet = true;
    SC.titleMakers.season = form => { const no = form.querySelector('[data-fk="no"] [data-v]')?.value?.trim(); const ser = SC.pkFirst(form.querySelector('[data-fk="series"]')); return no ? `${W(ser ? ART.defs.series && form.closest('.ar-dlg')?._C?.store.get(Number(ser.id))?.data?.skind : '').S} ${no}` : ''; };
    SC.titleMakers.episode = form => { const no = form.querySelector('[data-fk="no"] [data-v]')?.value?.trim(); return no ? `Épisode ${no}` : ''; };

    /* ═════════ Les clics et les cases du panneau ═════════ */
    const rootOf = el => el?.closest?.('[data-sc-series]');
    const ctxOf = root => { const C = root?.closest('.ar-dlg')?._C; if (!C) return null; const it = C.store.get(Number(root.dataset.scSeries)); return it ? {C, it, st: stOf(C.store, it.id)} : null; };
    const redraw = (root, focusSel = '') => { const x = ctxOf(root); if (!x) return; root.innerHTML = treeHtml(x.C.store, x.it); if (focusSel) root.querySelector(focusSel)?.focus(); };
    const readPanel = (root, st) => { root.querySelectorAll('[data-sp]').forEach(i => { st.draft[i.dataset.sp] = i.value; }); const a = root.querySelector('[data-sp-a]'), b = root.querySelector('[data-sp-b]'); if (a) st.ra = a.value; if (b) st.rb = b.value; };
    async function saveParts(x, rows, msg, undoable = false) {
        const {C, it} = x, old = U.clone(it.data || {}), data = {...U.clone(it.data || {}), participants: rows};
        const put = async d => { await ART.saveItem(C.store, 'series', it.id, d); await C.reload(); x.st.draft = null; C.paint(false); };
        await put(data);
        if (undoable) A().undoToast(msg, {undo: () => put(old), redo: () => put(data)}); else A().toast(msg, 'success');
    }
    const nextNo = list => Math.max(0, ...list.map(x => Number(x.data?.no) || 0)) + 1;
    async function addSeason(C, ser) { const ss = SC.seasonsOf(C.store, ser.id), n = nextNo(ss), w = W(ser.data?.skind);
        const id = await ART.saveItem(C.store, 'season', 0, {title: `${w.S} ${n}`, no: String(n), series: {iid: ser.id, title: ser.title, kind: 'series'}}); await C.reload(); stOf(C.store, ser.id).season = id; C.paint(false);
        A().undoToast(`${w.S} ${n} ajoutée`, {undo: async () => { await ART.write('delete_item', {person_id: C.pid, id}); await C.reload(); C.paint(false); }}); }
    async function addEpisodes(C, season, count) {
        const ser = C.store.get(refId(season.data?.series)), w = W(ser?.data?.skind), n0 = nextNo(SC.episodesOf(C.store, season.id)); count = Math.max(1, Math.min(200, Math.round(count)));
        const items = Array.from({length: count}, (_, i) => ({kind: 'episode', parent_id: season.id, data: {title: `${w.E} ${n0 + i}`, no: String(n0 + i), season: {iid: season.id, title: season.title, kind: 'season'}, ...(ser ? {series: {iid: ser.id, title: ser.title, kind: 'series'}} : {})}}));
        const extra = await ART.needArtist(C.store); const r = await ART.write('save_items', {person_id: C.pid, items, ...extra}); await C.reload(); C.paint(false); const ids = r?.ids || [];
        A().undoToast(`${plural(ids.length, `${w.e} ajouté`, `${w.es} ajoutés`)} (n° ${n0}${count > 1 ? ` à ${n0 + count - 1}` : ''})`, {undo: async () => { for (const id of ids) await ART.write('delete_item', {person_id: C.pid, id}); await C.reload(); C.paint(false); }});
    }
    const askCount = async w => { const v = await A().askText({title: `＋ Plusieurs ${w.es}`, message: `Combien d’${w.es} ajouter ? Ils sont numérotés à la suite ; tu écris ensuite leur titre, leur date…`, value: '10', inputMode: 'numeric', okLabel: 'Ajouter'}); const n = Number(String(v ?? '').replace(/\D/g, '')); return n > 0 ? n : 0; };
    const busy = new WeakSet();
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('click', async e => {
            const t = e.target, dlg = t.closest?.('.ar-dlg'); if (!dlg?._C) return; const C = dlg._C;
            // la saison (lecture de la fiche d'une saison)
            const sb = t.closest('button[data-sc-addep],button[data-sc-addeps]');
            if (sb && !rootOf(sb)) { const s = C.store.get(Number(sb.dataset.scAddep || sb.dataset.scAddeps)); if (!s) return;
                if (sb.dataset.scAddep !== undefined) { const ser = C.store.get(refId(s.data?.series)); { const n = nextNo(SC.episodesOf(C.store, s.id)); C.newItem('episode', {title: `${W(ser?.data?.skind).E} ${n}`, season: {iid: s.id, title: s.title, kind: 'season'}, ...(ser ? {series: {iid: ser.id, title: ser.title, kind: 'series'}} : {}), no: String(n)}); } return; }
                const n = await askCount(W(C.store.get(refId(s.data?.series))?.data?.skind)); if (n) { try { await addEpisodes(C, s, n); } catch (er) { if (er.message) A().toast(er.message, 'error'); } } return; }
            const root = rootOf(t); if (!root) return; const x = ctxOf(root); if (!x) return; const {it, st} = x, store = C.store;
            const chk = t.closest('input[data-sc-epchk]');
            if (chk) { readPanel(root, st); const id = Number(chk.dataset.scEpchk), list = [...root.querySelectorAll('input[data-sc-epchk]')], i = list.indexOf(chk);
                const on = chk.checked; if (e.shiftKey && st.last != null && list[st.last]) { const [a, b] = [Math.min(st.last, i), Math.max(st.last, i)]; list.slice(a, b + 1).forEach(c => { const k = Number(c.dataset.scEpchk); if (on) st.draft.eps.add(k); else st.draft.eps.delete(k); }); }
                else if (on) st.draft.eps.add(id); else st.draft.eps.delete(id);
                st.last = i; redraw(root, `input[data-sc-epchk="${id}"]`); return; }
            const b = t.closest('button'); const row = !b && t.closest('tr[data-sc-season], tr[data-sc-ep]');
            if (row) { readPanel(root, st); if (row.dataset.scSeason) { st.season = Number(row.dataset.scSeason); st.ep = 0; st.last = null; } else st.ep = st.ep === Number(row.dataset.scEp) ? 0 : Number(row.dataset.scEp); redraw(root); return; }
            if (!b || b.closest('.pk') || busy.has(b)) return; const d = b.dataset;
            const run = async fn => { busy.add(b); b.disabled = true; try { await fn(); } catch (er) { if (er?.message) A().toast(er.message, 'error'); } finally { busy.delete(b); if (b.isConnected) b.disabled = false; } };
            if (d.scFilter) { readPanel(root, st); st.filter = d.scFilter; redraw(root); return; }
            if (d.scEpclose !== undefined) { st.ep = 0; readPanel(root, st); redraw(root); return; }
            if (d.scEditep) { C.open(Number(d.scEditep), {edit: true}); return; }
            if (d.scMode) { readPanel(root, st); st.mode = d.scMode; st.draft = null; redraw(root); return; }
            if (d.scWho) { readPanel(root, st); const p = partsOf(it).find(r => pkey(r.who) === d.scWho); st.who = p ? U.person(p.who) : {pid: Number(store.pid), title: store.name}; const m = partsOf(it).find(r => pkey(r.who) === d.scWho); st.mode = m?.mode || 'role'; st.draft = null; redraw(root); return; }
            if (d.scAddwho !== undefined) { const p = await P().openPicker({kind: 'person', allowFree: true, title: 'Qui a travaillé sur cette série ?'}); if (!p) return; st.who = p.free || !p.id ? {pname: String(p.title || '').slice(0, 200)} : {pid: Number(p.id), title: p.title || ''}; if (!U.person(st.who)) { st.who = null; return; } st.mode = 'role'; st.draft = null; redraw(root); return; }
            const season = SC.seasonsOf(store, it.id).find(s => s.id === st.season);
            if (d.scRange !== undefined) { readPanel(root, st); const a = Number(String(st.ra).replace(/\D/g, '')), z = Number(String(st.rb).replace(/\D/g, '')) || a; if (!a || !season) return window.LCNDA_UI.fail(root.querySelector('[data-sp-a]'), 'Écris les numéros : du… au…');
                const [lo, hi] = [Math.min(a, z), Math.max(a, z)], l = SC.episodesOf(store, season.id).filter(e => { const n = Number(e.data?.no); return n >= lo && n <= hi; });
                if (!l.length) { A().toast(`Aucun épisode n° ${lo}${hi > lo ? ` à ${hi}` : ''} dans cette saison.`, 'error'); return; } l.forEach(e => st.draft.eps.add(e.id)); redraw(root); return; }
            if (d.scAll) { readPanel(root, st); if (d.scAll === 'none') st.draft.eps.clear(); else (d.scAll === 'season' ? (season ? SC.episodesOf(store, season.id) : []) : SC.seriesEpisodes(store, it.id).map(x2 => x2.e)).forEach(e2 => st.draft.eps.add(e2.id)); redraw(root); return; }
            if (d.scPcancel !== undefined) { st.draft = null; st.ra = st.rb = ''; redraw(root); return; }
            if (d.scPsave !== undefined || d.scPdel !== undefined) { readPanel(root, st); const D = st.draft, rows = partsOf(it).filter(r => !(pkey(r.who) === pkey(D.who) && (r.mode || 'role') === D.mode));
                if (d.scPdel !== undefined) { await run(() => saveParts(x, rows, `${U.nameOf(D.who)} ${(window.LCNDA_ACCORD?.accord || ((_, w) => w))(store.people?.find(p => p.person_id === Number(U.person(D.who)?.pid)) || store.genderOf?.(U.person(D.who)?.pid), 'retiré(e) de', {x: 'n’est plus dans'})} « ${it.title} »`, true)); return; }
                const row = Object.fromEntries(Object.entries({who: D.who, mode: D.mode, role: (D.mode === 'job' ? D.job : D.character).trim().slice(0, 120), character: D.mode === 'role' ? D.character.trim().slice(0, 300) : '', rkind: D.mode === 'role' ? D.rkind : '', job: D.mode === 'job' ? D.job.trim().slice(0, 120) : '',
                    eps: [...D.eps].filter(id => store.get(id)?.kind === 'episode').slice(0, 600), credit: D.credit.trim().slice(0, 200), fee: D.fee.trim().slice(0, 60), note: D.note.trim().slice(0, 500)}).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)));
                const at = partsOf(it).findIndex(r => pkey(r.who) === pkey(D.who) && (r.mode || 'role') === D.mode); if (at >= 0) rows.splice(Math.min(at, rows.length), 0, row); else rows.push(row);
                await run(() => saveParts(x, rows, `✓ Enregistré : ${U.nameOf(D.who)}${row.eps?.length ? ` · ${SC.epsLabel(store, it, row.eps)}` : ''}`)); return; }
            if (d.scAddseason !== undefined) { await run(() => addSeason(C, it)); return; }
            if (d.scAddep !== undefined && season) { const n = nextNo(SC.episodesOf(store, season.id)); C.newItem('episode', {title: `${W(it.data?.skind).E} ${n}`, season: {iid: season.id, title: season.title, kind: 'season'}, series: {iid: it.id, title: it.title, kind: 'series'}, no: String(n)}); return; }
            if (d.scAddeps !== undefined && season) { const n = await askCount(W(it.data?.skind)); if (n) await run(() => addEpisodes(C, season, n)); }
        });
        document.addEventListener('keydown', e => { const r = e.target.closest?.('[data-sc-series] tr[data-sc-season]'); if (r && e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
        document.addEventListener('input', e => { const root = rootOf(e.target); if (!root || !e.target.matches('[data-sp], [data-sp-a], [data-sp-b]')) return; const x = ctxOf(root); if (x) readPanel(root, x.st); });
        document.addEventListener('change', e => { const root = rootOf(e.target); if (!root || !e.target.matches('select[data-sp]')) return; const x = ctxOf(root); if (x) { readPanel(root, x.st); redraw(root); } });
    }
})();
