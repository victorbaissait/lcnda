/**
 * 🗳️ Cartes d'électeur (serveur : lib/voters.php, structure n°19)
 *  - bloc de la fiche (à cocher dans Identité → « Blocs à afficher sur la fiche ») : cartes, photos recto / verso,
 *    toutes les dates où la personne a voté ;
 *  - Listes → « Cartes d'électeur » : les électeurs de la famille, puis le droit de vote dans le monde
 *    (carte des hommes / des femmes, à une date choisie) et la liste de tous les pays, à déplier et à trier.
 * Chargé après heritage.js et heritage-more.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    for (const key of ['personBlocks', 'lists']) ext[key] = ext[key] || {};
    const esc = value => A().escapeHtml(value ?? '');
    const nl = value => esc(value).replace(/\n/g, '<br>');
    const api = (...args) => A().api(...args);
    const toast = (...args) => A().toast(...args);
    const card = (...args) => A().card(...args);
    const S = () => A().state;
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const isCurrent = token => token === S().workspaceToken && S().module === 'listes';
    const personLink = (id, name) => id ? `<button type="button" class="table-link" data-h-person="${Number(id)}">${esc(name || 'Personne')}</button>` : esc(name || '');
    const pname = p => p ? A().personName(p) : '';
    const header = (eyebrow, title, intro) => `<header class="page-header"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div></header>`;
    const tools = (...args) => ext.tools ? ext.tools(...args) : '';
    const refresh = () => ext.refreshView ? ext.refreshView() : null;
    const ls = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } };
    const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };

    let elections = {presidentielle: 'Présidentielle', legislatives: 'Législatives', municipales: 'Municipales', cantonales: 'Cantonales / départementales', regionales: 'Régionales', europeennes: 'Européennes', referendum: 'Référendum', plebiscite: 'Plébiscite', senatoriales: 'Sénatoriales (grands électeurs)', prudhomales: 'Prud’homales', professionnelles: 'Élections professionnelles (chambres, sécurité sociale…)', autre: 'Autre'};
    const CARD_LABELS = {commune: 'Commune', country: 'Pays', issued: 'Délivrée le', valid_from: 'Valable à partir de', valid_to: 'Jusqu’à', card_number: 'N° de carte', list_number: 'N° d’inscription sur la liste', bureau: 'Bureau de vote', bureau_address: 'Adresse du bureau', address: 'Adresse de l’électeur (sur la carte)', written_name: 'Nom écrit sur la carte', written_birth: 'Naissance écrite sur la carte', occupation: 'Profession écrite', reason: 'Motif d’inscription', source: 'Source, cote', note: 'Remarques'};

    /* ─── Données du monde (chargées une fois) ─── */
    let worldData = null, worldReady = null;
    const loadWorld = () => worldData || (worldData = Promise.all([fetch('assets/data/suffrage.json').then(r => r.json()), fetch('assets/data/world-110m.json').then(r => r.json())])
        .then(([suffrage, map]) => (worldReady = {suffrage, map, byId: Object.fromEntries(suffrage.countries.map(c => [c.id, c]))})).catch(error => { worldData = null; throw error; }));
    const FRANCE = '250';
    const countryOf = name => String(name || '').trim().toLowerCase();

    /** « Elle a pu voter à partir de 1945 » : d'après le sexe de la personne et le pays de ses cartes. */
    function rightLine(person, cards, world) {
        if (!world) return '';
        if (!['female', 'male'].includes(person.gender)) return '';
        const names = [...new Set(cards.map(c => countryOf(c.country)).filter(Boolean))];
        const country = names.length ? world.suffrage.countries.find(c => c.name.toLowerCase() === names[0]) : world.byId[FRANCE]; // pays inconnu : rien plutôt qu'une date fausse
        if (!country) return '';
        const female = person.gender === 'female', year = female ? country.women : country.men;
        if (!year) return '';
        const born = Number(person.birth_year) || 0, died = Number(person.death_year) || 0;
        // majorité : 21 ans, puis 18 ans à partir de 1974 (France ; la plupart des pays l'ont abaissée vers 1970)
        const adult = born ? Math.min(born + 21, Math.max(born + 18, 1974)) : 0;
        const from = Math.max(year, adult);
        const who = female ? 'elle' : 'il';
        const after = !born ? '' : died && died < from ? ` — ${female ? 'morte' : 'mort'} en ${died}, ${who} n’a pas pu voter à ce titre` : ` — ${who} a pu voter à partir de ${from}${adult > year ? ` (à ses ${adult - born} ans)` : ''}`;
        return `<p class="h-voter-right">🗳️ Droit de vote des ${female ? 'femmes' : 'hommes'} (${esc(country.name)}) : <strong>${year}</strong>${after}.</p>`;
    }

    function cardHtml(c) {
        const head = [c.card_number && `Carte n° ${esc(c.card_number)}`, c.commune && `<strong>${esc(c.commune)}</strong>${c.country && c.country !== 'France' ? ` (${esc(c.country)})` : ''}`, c.bureau && `bureau ${esc(c.bureau)}`].filter(Boolean).join(' · ');
        const dates = [c.issued && `délivrée le ${esc(c.issued)}`, (c.valid_from || c.valid_to) && `valable ${esc(c.valid_from || '?')} → ${esc(c.valid_to || '?')}`].filter(Boolean).join(' · ');
        const rest = ['list_number', 'bureau_address', 'address', 'written_name', 'written_birth', 'occupation', 'reason', 'source'].filter(k => c[k]).map(k => `<div class="data-row"><dt>${esc(CARD_LABELS[k])}</dt><dd>${esc(c[k])}</dd></div>`).join('');
        return `<article class="h-voter-card"><header>🗳️ ${head || 'Carte d’électeur'}</header>${dates ? `<p class="muted">${dates}</p>` : ''}${rest ? `<dl class="data-list">${rest}</dl>` : ''}${c.note ? `<p class="h-transcription">${nl(c.note)}</p>` : ''}</article>`;
    }
    function votesHtml(votes) {
        if (!votes.length) return '';
        const years = votes.map(v => Number(v.year)).filter(Boolean);
        return `<h5>${plural(votes.length, 'vote noté', 'votes notés')}${years.length ? ` (${Math.min(...years)}${Math.max(...years) !== Math.min(...years) ? '–' + Math.max(...years) : ''})` : ''}</h5>
            <div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr><th><button data-sort-column="0">Date</button></th><th><button data-sort-column="1">Élection</button></th><th>Tour</th><th><button data-sort-column="3">Lieu</button></th><th>Tampon, case</th><th>Remarque</th></tr></thead><tbody>
            ${votes.map(v => `<tr><td data-sort-value="${esc(v.sort_key || v.year || 9999)}">${esc(v.date_text || '—')}</td><td data-sort-value="${esc(v.election_label || '')}">${esc(v.election_label || elections[v.election] || '—')}</td><td>${Number(v.round) ? `${v.round}${Number(v.round) === 1 ? 'er' : 'e'} tour` : ''}</td><td data-sort-value="${esc(v.place_text || '')}">${esc(v.place_text || '')}</td><td>${esc(v.stamp || '')}</td><td>${esc(v.note || '')}</td></tr>`).join('')}</tbody></table></div>`;
    }
    function voterHtml(d, person, world) {
        const media = d.media || [];
        return `${ext.labelChips ? ext.labelChips(d.labels) : ''}${rightLine(person, d.cards || [], world)}
            ${(d.cards || []).length ? `<div class="h-voter-cards">${d.cards.map(cardHtml).join('')}</div>` : ''}
            ${media.length && ext.thumbs ? `<h5>Photos des cartes</h5>${ext.thumbs('voter-' + person.id, media)}` : ''}
            ${votesHtml(d.votes || [])}
            ${!(d.cards || []).length && !(d.votes || []).length && !media.length ? '<p class="muted">Aucune carte notée. Ajoute les cartes d’électeur (photos recto / verso, commune, bureau, numéros) et les dates où la personne a voté.</p>' : ''}`;
    }

    ext.personBlocks.voter = (index, detail, {editOnly}) => {
        const p = detail.person, d = detail.heritage?.voter;
        if (!d) return '';
        if (d.elections) elections = d.elections;
        const has = (d.cards || []).length || (d.votes || []).length || (d.media || []).length;
        if (!(ext.flagShown ? ext.flagShown(p, 'show_voter_block') : Number(p.show_voter_block)) && !has) return '';
        const id = `h-voter-${p.id}`;
        // la phrase « a pu voter à partir de… » arrive avec les dates du droit de vote (chargées une fois)
        if (!worldReady) loadWorld().then(w => { const box = document.getElementById(id); if (box) { box.innerHTML = voterHtml(d, p, w); A().bindTableLinks(); } }).catch(() => {});
        return card(index, 'Cartes d’électeur', (d.votes || []).length || (d.cards || []).length || '', `<div id="${id}">${voterHtml(d, p, worldReady)}</div>`, 'span-12',
            editOnly(has ? tools(`data-h-voter-edit="${p.id}"`, `data-h-voter-clear="${p.id}"`, 'les cartes d’électeur') : `<button type="button" class="button small secondary" data-h-voter-edit="${p.id}">+ Carte, votes</button>`));
    };
    document.addEventListener('click', async event => {
        const edit = event.target.closest?.('[data-h-voter-edit]');
        if (edit) { openVoterDialog(Number(edit.dataset.hVoterEdit)); return; }
        const clear = event.target.closest?.('[data-h-voter-clear]');
        if (clear && await A().confirmBox('Supprimer les cartes d’électeur et les votes de cette fiche ?', {title: 'Supprimer les cartes et votes', okLabel: 'Supprimer'})) {
            try { await api('clear_voter_cards', {}, {method: 'POST', body: {person_id: clear.dataset.hVoterClear}}); toast('Cartes effacées.'); refresh(); } catch (error) { toast(error.message, 'error'); }
        }
    });

    /* ─── Fenêtre de saisie ─── */
    const cardRow = (c = {}) => `<fieldset class="h-voter-row"><legend>Carte</legend><div class="form-grid">
        <label>Commune${ext.placeField ? ext.placeField('c_commune', c.commune, c.lat, c.lon, 'Halluin') : `<input name="c_commune" value="${esc(c.commune || '')}">`}</label>
        <label>Pays<input name="c_country" value="${esc(c.country || '')}" placeholder="France"></label>
        <label>Délivrée le<input name="c_issued" value="${esc(c.issued || '')}" placeholder="3 mars 1919"></label>
        <label>N° de carte<input name="c_card_number" value="${esc(c.card_number || '')}"></label>
        <label>Valable à partir de<input name="c_valid_from" value="${esc(c.valid_from || '')}" placeholder="1919"></label>
        <label>Jusqu’à<input name="c_valid_to" value="${esc(c.valid_to || '')}" placeholder="1925"></label>
        <label>Bureau de vote<input name="c_bureau" value="${esc(c.bureau || '')}" placeholder="n° 2, école des garçons"></label>
        <label>Adresse du bureau<input name="c_bureau_address" value="${esc(c.bureau_address || '')}"></label>
        <label>N° d’inscription sur la liste<input name="c_list_number" value="${esc(c.list_number || '')}"></label>
        <label>Adresse de l’électeur<input name="c_address" value="${esc(c.address || '')}" placeholder="12 rue de Lille"></label>
        <label>Nom écrit sur la carte<input name="c_written_name" value="${esc(c.written_name || '')}"></label>
        <label>Naissance écrite<input name="c_written_birth" value="${esc(c.written_birth || '')}" placeholder="né le 4 mai 1890 à Menin (Belgique)"></label>
        <label>Profession écrite<input name="c_occupation" value="${esc(c.occupation || '')}"></label>
        <label>Motif d’inscription<input name="c_reason" value="${esc(c.reason || '')}" placeholder="première inscription, changement de domicile…"></label>
        <label class="span-2">Source, cote<input name="c_source" value="${esc(c.source || '')}" placeholder="papiers de famille ; AD Nord 3 M 123 (listes électorales)"></label>
        <label class="span-2">Remarques<textarea name="c_note" rows="2">${esc(c.note || '')}</textarea></label></div>
        <div class="h-row-actions"><button type="button" class="icon-button danger" data-h-voter-del title="Retirer cette carte">×</button></div></fieldset>`;
    const voteRow = (v = {}) => `<div class="h-voter-vote"><input name="v_date" value="${esc(v.date_text || '')}" placeholder="11 mai 1924" aria-label="Date">
        <select name="v_election" aria-label="Élection"><option value="">Élection…</option>${Object.entries(elections).map(([k, l]) => `<option value="${k}" ${v.election === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select name="v_round" aria-label="Tour"><option value="0">—</option><option value="1" ${Number(v.round) === 1 ? 'selected' : ''}>1er tour</option><option value="2" ${Number(v.round) === 2 ? 'selected' : ''}>2e tour</option></select>
        <input name="v_place" value="${esc(v.place_text || '')}" placeholder="Lieu (si autre)" aria-label="Lieu"><input name="v_stamp" value="${esc(v.stamp || '')}" placeholder="Tampon, case n°" aria-label="Tampon">
        <input name="v_note" value="${esc(v.note || '')}" placeholder="Remarque" aria-label="Remarque"><button type="button" class="icon-button danger" data-h-vote-del title="Retirer">×</button></div>`;
    async function openVoterDialog(personId) {
        let d;
        try { d = await api('voter', {person_id: personId}); } catch (error) { toast(error.message, 'error'); return; }
        if (d.elections) elections = d.elections;
        const own = (d.media || []).filter(m => m.role !== 'fiche');
        ext.openDialog({
            eyebrow: 'CARTES D’ÉLECTEUR', title: 'Cartes d’électeur et votes', wide: true, labels: ['voter', d.labels],
            body: `<p class="muted">Une carte par période ou par commune. Les dates de vote sont souvent tamponnées au dos (une case par élection).</p>
                <div data-h-voter-cards>${(d.cards.length ? d.cards : [{}]).map(cardRow).join('')}</div><button type="button" class="button small secondary" data-h-voter-addcard>+ Carte</button>
                <h4>Les dates où la personne a voté</h4>
                <div class="h-voter-votes" data-h-voter-votes>${d.votes.map(voteRow).join('')}</div>
                <p><button type="button" class="button small secondary" data-h-voter-addvote>+ Vote</button> <button type="button" class="link-button" data-h-voter-many>Ajouter plusieurs dates d’un coup…</button></p>
                <div class="h-voter-many" hidden><label>Une date par ligne (ou séparées par des virgules ou des points-virgules)<textarea rows="3" data-h-voter-many-text placeholder="11 mai 1924&#10;29 avril 1928&#10;1er mai 1932"></textarea></label>
                    <label>Élection<select data-h-voter-many-election><option value="">—</option>${Object.entries(elections).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><button type="button" class="button small" data-h-voter-many-add>Ajouter ces dates</button></div>
                <h4>Photos</h4>${ext.mediaEditorHtml ? ext.mediaEditorHtml('voter', personId, own, [['recto', 'Recto des cartes', 'image/*,application/pdf'], ['verso', 'Verso (tampons des votes)', 'image/*,application/pdf'], ['', 'Autres documents (listes électorales, convocations…)', 'image/*,application/pdf']]) : ''}
                ${(d.media || []).some(m => m.role === 'fiche') ? '<p class="muted">Les médias de la fiche notés « Carte d’électeur » (Nature du média) s’affichent aussi dans ce bloc.</p>' : ''}`,
            onOpen: dlg => {
                const cards = dlg.querySelector('[data-h-voter-cards]'), votes = dlg.querySelector('[data-h-voter-votes]');
                dlg.querySelector('[data-h-voter-addcard]').addEventListener('click', () => cards.insertAdjacentHTML('beforeend', cardRow()));
                dlg.querySelector('[data-h-voter-addvote]').addEventListener('click', () => { votes.insertAdjacentHTML('beforeend', voteRow()); votes.lastElementChild.querySelector('input').focus(); });
                cards.addEventListener('click', e => { if (e.target.closest('[data-h-voter-del]')) e.target.closest('.h-voter-row').remove(); });
                votes.addEventListener('click', e => { if (e.target.closest('[data-h-vote-del]')) e.target.closest('.h-voter-vote').remove(); });
                dlg.querySelector('[data-h-voter-many]').addEventListener('click', () => { const box = dlg.querySelector('.h-voter-many'); box.hidden = !box.hidden; });
                dlg.querySelector('[data-h-voter-many-add]').addEventListener('click', () => {
                    const ta = dlg.querySelector('[data-h-voter-many-text]'), election = dlg.querySelector('[data-h-voter-many-election]').value;
                    const dates = ta.value.split(/[\n;,]+/).map(x => x.trim()).filter(Boolean);
                    dates.forEach(date => votes.insertAdjacentHTML('beforeend', voteRow({date_text: date, election})));
                    ta.value = '';
                    toast(`${plural(dates.length, 'date ajoutée', 'dates ajoutées')}.`);
                });
            },
            onSubmit: async form => {
                const val = (row, n) => row.querySelector(`[name="${n}"]`)?.value || '';
                const cards = [...form.querySelectorAll('.h-voter-row')].map(row => ({
                    commune: val(row, 'c_commune'), lat: val(row, 'c_commune_lat'), lon: val(row, 'c_commune_lon'),
                    ...Object.fromEntries(['country', 'issued', 'valid_from', 'valid_to', 'card_number', 'list_number', 'bureau', 'bureau_address', 'address', 'written_name', 'written_birth', 'occupation', 'reason', 'source', 'note'].map(k => [k, val(row, 'c_' + k)])),
                }));
                const votes = [...form.querySelectorAll('.h-voter-vote')].map(row => ({date_text: val(row, 'v_date'), election: val(row, 'v_election'), round: val(row, 'v_round'), place_text: val(row, 'v_place'), stamp: val(row, 'v_stamp'), note: val(row, 'v_note')}));
                await api('save_voter_cards', {}, {method: 'POST', body: {person_id: personId, cards, votes}});
                if (ext.uploadMediaEditor) await ext.uploadMediaEditor(form, 'voter', personId);
                toast('Cartes d’électeur enregistrées.');
                refresh();
            },
        });
    }

    /* ─── Liste « Cartes d'électeur » et le droit de vote dans le monde ─── */
    const PERIODS = [[0, 1899, '#1d3f72', 'avant 1900'], [1900, 1918, '#2b6cb0', '1900–1918'], [1919, 1944, '#4a90c8', '1919–1944'], [1945, 1959, '#7cb7de', '1945–1959'], [1960, 1979, '#f0b45a', '1960–1979'], [1980, 9999, '#d9534f', '1980 et après']];
    const periodColor = y => (PERIODS.find(([a, b]) => y >= a && y <= b) || [])[2] || '';
    const yearOf = (c, who) => who === 'men' ? c.men : c.women;
    function mapSvg(world, who, atYear, selected = '') {
        const {map, byId} = world;
        return `<svg class="h-suffrage-map" viewBox="0 0 ${map.width} ${map.height}" role="img" aria-label="Carte du droit de vote">
            ${map.countries.map(c => {
                const s = byId[c.id], y = s ? (who === 'gap' ? (s.men && s.women ? s.women - s.men : null) : yearOf(s, who)) : null;
                let fill = '#d8d8d8';
                if (y !== null && y !== undefined) {
                    if (who === 'gap') fill = y < 0 ? '#3b8ec4' : y === 0 ? '#4a9d5b' : y <= 10 ? '#9ccf8a' : y <= 30 ? '#f0b45a' : y <= 60 ? '#e07b39' : '#c0392b';
                    else if (atYear) fill = y <= atYear ? '#2f8f5b' : '#e3e3e3';
                    else fill = periodColor(y);
                }
                const tip = s ? `${s.name} — hommes : ${s.men || '?'} · femmes : ${s.women || '?'}` : `${c.name} — pas de date dans la liste`;
                return `<path d="${c.d}" fill="${fill}" ${selected && c.id === selected ? 'class="is-selected"' : ''} data-h-suffrage-country="${esc(c.id)}"><title>${esc(tip)}</title></path>`;
            }).join('')}</svg>`;
    }
    function legendHtml(who, atYear) {
        if (who === 'gap') return `<div class="h-suffrage-legend">${[['#3b8ec4', 'les femmes avant'], ['#4a9d5b', 'en même temps'], ['#9ccf8a', '1 à 10 ans'], ['#f0b45a', '11 à 30 ans'], ['#e07b39', '31 à 60 ans'], ['#c0392b', 'plus de 60 ans'], ['#d8d8d8', 'pas de date']].map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}<small class="muted">Années entre le vote des hommes et celui des femmes.</small></div>`;
        if (atYear) return `<div class="h-suffrage-legend"><span><i style="background:#2f8f5b"></i>${who === 'men' ? 'les hommes votent' : 'les femmes votent'} en ${atYear}</span><span><i style="background:#e3e3e3"></i>pas encore</span><span><i style="background:#d8d8d8"></i>pas de date</span></div>`;
        return `<div class="h-suffrage-legend">${PERIODS.map(([, , c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}<span><i style="background:#d8d8d8"></i>pas de date</span></div>`;
    }
    function countryInfo(s) {
        if (!s) return '';
        return `<div class="h-suffrage-info"><h4>${esc(s.name)} <small class="muted">${esc(s.region)}</small></h4><p>👨 Hommes : <strong>${s.men || '—'}</strong> · 👩 Femmes : <strong>${s.women || '—'}</strong>${s.men && s.women ? ` <small class="muted">(${s.women - s.men > 0 ? `${s.women - s.men} ans d’écart` : s.women < s.men ? `les femmes ${s.men - s.women} ans avant les hommes` : 'en même temps'})</small>` : ''}</p>${s.note ? `<p>${esc(s.note)}</p>` : ''}
            ${s.subdivisions ? `<details open><summary>${esc(s.subdivisions_label || 'Régions')}</summary><table class="data-table"><tbody>${[...s.subdivisions].sort((a, b) => a.women - b.women || a.name.localeCompare(b.name, 'fr')).map(x => `<tr><td>${esc(x.name)}</td><td>${x.women}</td><td><small>${esc(x.note || '')}</small></td></tr>`).join('')}</tbody></table></details>` : ''}</div>`;
    }
    const SORTS = {name: ['Pays (A → Z)', (a, b) => a.name.localeCompare(b.name, 'fr')], region: ['Région, puis pays', (a, b) => a.region.localeCompare(b.region, 'fr') || a.name.localeCompare(b.name, 'fr')],
        women: ['Date pour les femmes', (a, b) => (a.women || 9999) - (b.women || 9999) || a.name.localeCompare(b.name, 'fr')], men: ['Date pour les hommes', (a, b) => (a.men || 9999) - (b.men || 9999) || a.name.localeCompare(b.name, 'fr')],
        gap: ['Écart hommes / femmes', (a, b) => ((b.women && b.men) ? b.women - b.men : -1) - ((a.women && a.men) ? a.women - a.men : -1) || a.name.localeCompare(b.name, 'fr')]};
    function countryListHtml(world, sort, region) {
        const rows = world.suffrage.countries.filter(c => !region || c.region === region).sort(SORTS[sort]?.[1] || SORTS.name[1]);
        let lastRegion = '';
        return `<div class="data-table-wrap"><table class="data-table h-suffrage-table"><thead><tr><th>Pays</th><th>Région</th><th>Hommes</th><th>Femmes</th><th>Écart</th><th>Précisions</th></tr></thead><tbody>${rows.map(c => {
            const group = sort === 'region' && c.region !== lastRegion ? `<tr class="h-suffrage-group"><td colspan="6">${esc(lastRegion = c.region)}</td></tr>` : '';
            const subs = c.subdivisions ? `<details><summary>${esc(c.subdivisions_label || 'Régions')} (${c.subdivisions.length})</summary><ul class="h-suffrage-subs">${[...c.subdivisions].sort((a, b) => sort === 'name' || sort === 'region' ? a.name.localeCompare(b.name, 'fr') : a.women - b.women).map(x => `<li><strong>${x.women}</strong> ${esc(x.name)}${x.note ? ` <small class="muted">— ${esc(x.note)}</small>` : ''}</li>`).join('')}</ul></details>` : '';
            return `${group}<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.region)}</td><td>${c.men || '—'}</td><td>${c.women || '—'}</td><td>${c.men && c.women ? (c.women - c.men > 0 ? `${c.women - c.men} ans` : c.women < c.men ? `femmes ${c.men - c.women} ans avant` : '=') : ''}</td><td><small>${esc(c.note || '')}</small>${subs}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    }

    ext.lists.voter_cards = async token => {
        let data, world = null;
        try { [data, world] = await Promise.all([api('voter_overview'), loadWorld().catch(() => null)]); }
        catch (error) { if (isCurrent(token)) A().$('#workspace').innerHTML = `<section class="page">${A().empty(error.message)}</section>`; return; }
        if (!isCurrent(token)) return;
        const st = S();
        st.hSuffrage = st.hSuffrage || {who: ls('lcnda-suffrage-who', 'women'), atYear: 0, sort: 'name', region: '', open: ''};
        const people = data.people || [];
        const votes = people.reduce((n, r) => n + r.votes.length, 0);
        const regions = world ? [...new Set(world.suffrage.countries.map(c => c.region))].sort((a, b) => a.localeCompare(b, 'fr')) : [];
        A().$('#workspace').innerHTML = `<section class="page collection-page h-voters">${header('LISTES', 'Cartes d’électeur', 'Les électeurs de la famille, leurs cartes et les dates où ils ont voté. Pour en ajouter : fiche → Identité → « Blocs à afficher sur la fiche » → 🗳️ Cartes d’électeur.')}
            ${people.length ? `<p class="muted">${plural(people.length, 'électeur', 'électeurs')} · ${plural(people.reduce((n, r) => n + r.cards.length, 0), 'carte', 'cartes')} · ${plural(votes, 'vote noté', 'votes notés')}</p>
            <div class="data-table-wrap"><table class="data-table sortable-table"><thead><tr>${['Personne', 'Commune(s)', 'Cartes', 'Votes', 'Premier vote ou carte', 'Dernier'].map((h, i) => `<th><button data-sort-column="${i}">${h}</button></th>`).join('')}<th>Photos</th></tr></thead><tbody>
                ${people.map(r => `<tr><td data-sort-value="${esc(pname(r.person).toLowerCase())}">${personLink(r.person.id, pname(r.person))}${r.person.birth_year ? ` <small class="muted">(${esc(r.person.birth_year)}–${esc(r.person.death_year || '')})</small>` : ''}</td><td data-sort-value="${esc((r.communes[0] || '').toLowerCase())}">${esc(r.communes.join(', ') || '—')}</td><td data-sort-value="${r.cards.length}">${r.cards.length}</td><td data-sort-value="${r.votes.length}">${r.votes.length}</td><td data-sort-value="${r.first || 9999}">${r.first || '—'}</td><td data-sort-value="${r.last || 0}">${r.last || '—'}</td><td>${ext.thumbs ? ext.thumbs('voters-list-' + r.person.id, (r.media || []).slice(0, 4)) : ''}</td></tr>`).join('')}</tbody></table></div>`
            : A().emptyState({icon: '🗳️', text: 'Aucune carte d’électeur pour l’instant', hint: 'Elles s’ajoutent sur la fiche d’une personne (bloc Cartes d’électeur).'})}
            ${world ? `<section class="maintenance-panel h-suffrage"><h3>🌍 Le droit de vote dans le monde</h3>
                <div class="h-suffrage-controls"><div class="segmented">${[['women', '👩 Femmes'], ['men', '👨 Hommes'], ['gap', '↔ Écart']].map(([k, l]) => `<button type="button" data-h-suffrage-who="${k}" class="${st.hSuffrage.who === k ? 'is-active' : ''}">${l}</button>`).join('')}</div>
                    ${st.hSuffrage.who !== 'gap' ? `<label class="checkbox-line"><input type="checkbox" data-h-suffrage-at ${st.hSuffrage.atYear ? 'checked' : ''}> Voir qui pouvait voter en</label><input type="range" min="1840" max="2025" step="1" value="${st.hSuffrage.atYear || 1920}" data-h-suffrage-year ${st.hSuffrage.atYear ? '' : 'disabled'} aria-label="Année"><strong data-h-suffrage-yearlabel>${st.hSuffrage.atYear || ''}</strong>` : ''}</div>
                <div data-h-suffrage-map>${mapSvg(world, st.hSuffrage.who, st.hSuffrage.atYear, st.hSuffrage.open)}</div><div data-h-suffrage-legend>${legendHtml(st.hSuffrage.who, st.hSuffrage.atYear)}</div>
                <div data-h-suffrage-info>${countryInfo(world.byId[st.hSuffrage.open]) || '<p class="muted">Clique sur un pays pour voir ses dates (et les cantons suisses, les provinces canadiennes…).</p>'}</div>
                <details class="h-suffrage-list" ${st.hSuffrage.listOpen ? 'open' : ''}><summary><strong>Tous les pays, dans l’ordre que tu veux</strong> <span class="muted">(${world.suffrage.countries.length})</span></summary>
                    <div class="h-suffrage-controls"><label>Trier par <select data-h-suffrage-sort>${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}" ${st.hSuffrage.sort === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
                    <label>Région <select data-h-suffrage-region><option value="">Toutes</option>${regions.map(r => `<option ${st.hSuffrage.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label></div>
                    <div data-h-suffrage-rows>${countryListHtml(world, st.hSuffrage.sort, st.hSuffrage.region)}</div></details>
                <p class="muted"><small>${esc(world.suffrage.source)} Fond de carte : Natural Earth (domaine public) ; les tout petits pays ne sont que dans la liste.</small></p></section>` : '<p class="muted">La carte du droit de vote n’a pas pu être chargée.</p>'}</section>`;
        A().bindTableLinks();
        if (!world) return;
        const ws = A().$('#workspace');
        const redrawMap = () => {
            ws.querySelector('[data-h-suffrage-map]').innerHTML = mapSvg(world, st.hSuffrage.who, st.hSuffrage.atYear, st.hSuffrage.open);
            ws.querySelector('[data-h-suffrage-legend]').innerHTML = legendHtml(st.hSuffrage.who, st.hSuffrage.atYear);
        };
        ws.querySelectorAll('[data-h-suffrage-who]').forEach(b => b.addEventListener('click', () => { st.hSuffrage.who = b.dataset.hSuffrageWho; lsSet('lcnda-suffrage-who', st.hSuffrage.who); if (st.hSuffrage.who === 'gap') st.hSuffrage.atYear = 0; ext.lists.voter_cards(++st.workspaceToken); }));
        const slider = ws.querySelector('[data-h-suffrage-year]'), yearLabel = ws.querySelector('[data-h-suffrage-yearlabel]');
        ws.querySelector('[data-h-suffrage-at]')?.addEventListener('change', e => { slider.disabled = !e.target.checked; st.hSuffrage.atYear = e.target.checked ? Number(slider.value) : 0; yearLabel.textContent = st.hSuffrage.atYear || ''; redrawMap(); });
        slider?.addEventListener('input', () => { st.hSuffrage.atYear = Number(slider.value); yearLabel.textContent = slider.value; redrawMap(); });
        ws.querySelector('[data-h-suffrage-map]').addEventListener('click', e => {
            const path = e.target.closest('[data-h-suffrage-country]');
            if (!path) return;
            st.hSuffrage.open = path.dataset.hSuffrageCountry;
            ws.querySelector('[data-h-suffrage-info]').innerHTML = countryInfo(world.byId[st.hSuffrage.open]) || `<p class="muted">Pas de date pour ce pays dans la liste.</p>`;
            ws.querySelectorAll('.h-suffrage-map path.is-selected').forEach(p => p.classList.remove('is-selected'));
            path.classList.add('is-selected');
        });
        const rows = ws.querySelector('[data-h-suffrage-rows]');
        ws.querySelector('.h-suffrage-list').addEventListener('toggle', e => { st.hSuffrage.listOpen = e.target.open; });
        ws.querySelector('[data-h-suffrage-sort]').addEventListener('change', e => { st.hSuffrage.sort = e.target.value; rows.innerHTML = countryListHtml(world, st.hSuffrage.sort, st.hSuffrage.region); });
        ws.querySelector('[data-h-suffrage-region]').addEventListener('change', e => { st.hSuffrage.region = e.target.value; rows.innerHTML = countryListHtml(world, st.hSuffrage.sort, st.hSuffrage.region); });
    };
})();
