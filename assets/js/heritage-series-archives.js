/**
 * 🗂 Les séries, c'est quoi ? — un petit rappel sourcé du cadre de classement des Archives départementales :
 * ce que veut dire chaque lettre (A à Z, W, J, Fi, Mi, E-dépôt…), pourquoi cela varie d'un département à l'autre
 * (sous-séries et numéros propres à chacun : notaires en 3 E ici, en 5 E ailleurs), et pourquoi savoir ce qui est
 * en ligne, sur place ou encore réservé (délais de communicabilité, code du patrimoine art. L213-2).
 *
 * Pas de surcharge : un petit lien « ⓘ Les séries, c’est quoi ? » (ext.seriesArchives.link()) qui ouvre une fenêtre.
 * Où : fiche d'un service d'archives (carte « 🗂 Séries ») et sa fenêtre (champ « Séries »), champ « Série » de la
 * fenêtre « Source » et de la fenêtre d'un média (heritage-archive-services.js), « Pourquoi cette pastille ? » et
 * « Ses actes aux archives » de 🌍 Où chercher ? (heritage-archives-dispo.js).
 *
 * Sources (ouvertes et vérifiées le 25 novembre 2026) :
 *  - circulaire du ministre de l'Intérieur du 24 avril 1841 « Instructions pour la mise en ordre et le classement des
 *    archives départementales et communales », et son « Cadre pour servir au classement… » (séries A à Z), reproduite
 *    dans « Lois, instructions et règlements relatifs aux archives départementales, communales et hospitalières »
 *    (Paris, 1884), Internet Archive ;
 *  - Wikipédia, « Archives départementales », section « Le cadre de classement » (circulaire AD 98-8 du 18 décembre 1998
 *    de la direction des Archives de France, série W de 1979, E-dépôt, J, Fi, Mi, notaires en 3 E ou 5 E) ;
 *  - code du patrimoine, art. L213-2 (Légifrance : le même lien que heritage-archives-dispo.js).
 * (Les PDF de FranceArchives — circulaire AD 98-8 — refusent la lecture automatique : non liés ici.)
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const i18n = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const safeUrl = u => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
    const SRC_1841 = 'https://archive.org/details/loisinstruction00frangoog';
    const SRC_WIKI = 'https://fr.wikipedia.org/wiki/Archives_d%C3%A9partementales';
    const LEGI = 'https://www.legifrance.gouv.fr/search/code?tab_selection=code&searchField=ALL&query=L213-2%20code%20du%20patrimoine&page=1&init=true';
    const ext_ = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;

    /** [période, [[lettre, ce qu'on y trouve, utile pour le généalogiste]]] */
    const TABLE = [
        ['Avant 1790 (Ancien Régime)', [
            ['A', 'Actes du pouvoir souverain, domaine royal', 'Rarement : édits, apanages'],
            ['B', 'Cours et juridictions : parlements, bailliages, sénéchaussées, justices seigneuriales', 'Procès, tutelles, scellés'],
            ['C', 'Administrations provinciales : intendance, élections, états provinciaux', 'Rôles d’impôts, enquêtes'],
            ['D', 'Instruction publique, sciences et arts : universités, collèges', 'Élèves et maîtres'],
            ['E', 'Féodalité, communes, bourgeoisie, familles ; notaires et tabellions ; corporations', 'Notaires (contrats de mariage, testaments), terriers, papiers de famille ; souvent l’état civil'],
            ['G', 'Clergé séculier : évêchés, chapitres, paroisses et fabriques, officialités', 'Dispenses de mariage, fabriques'],
            ['H', 'Clergé régulier : abbayes, couvents, ordres ; hospices', 'Religieux et religieuses, hospices']]],
        ['Révolution (1790-1800)', [
            ['L', 'Administrations de département, de district et de canton ; tribunaux de la Révolution', 'Émigrés, gardes nationaux, listes de la période'],
            ['Q', 'Domaines : biens nationaux', 'Ventes de biens nationaux']]],
        ['1800-1940', [
            ['K', 'Lois, ordonnances, arrêtés', 'Rarement'],
            ['M', 'Administration générale : élections, police, population, état civil, statistique', 'Recensements, naturalisations, police'],
            ['N', 'Administration et comptabilité départementales', 'Peu'],
            ['O', 'Administration communale', 'Les affaires de ta commune : école, chemins, biens'],
            ['P', 'Finances : contributions, cadastre, eaux et forêts, douanes, postes', 'Cadastre (plans et matrices), impôts'],
            ['Q', 'Domaines, enregistrement, hypothèques', 'Tables de successions, mutations après décès, hypothèques'],
            ['R', 'Guerre et affaires militaires : recrutement, garde nationale, gendarmerie', 'Registres matricules, conscription'],
            ['S', 'Travaux publics, transports', 'Moulins, cours d’eau, chemins de fer'],
            ['T', 'Enseignement, culture', 'Instituteurs'],
            ['U', 'Justice : tribunaux', 'Jugements, divorces, procès'],
            ['V', 'Cultes', 'Curés, pasteurs, fabriques'],
            ['X', 'Assistance : hospices, bienfaisance, enfants trouvés, aliénés', 'Enfants assistés'],
            ['Y', 'Établissements pénitentiaires : prisons', 'Registres d’écrou'],
            ['Z', 'Sous-préfectures (avant : affaires diverses)', 'Les mêmes dossiers, côté arrondissement']]],
        ['Après 1940', [
            ['W', 'Archives publiques versées depuis le 10 juillet 1940, numérotées par versement (1 W, 1000 W…)', 'Dossiers récents : souvent sous délai de communicabilité']]],
        ['Toutes époques', [
            ['E-dépôt', 'Archives des communes déposées (dont registres paroissiaux et d’état civil)', 'Délibérations et registres de la commune'],
            ['J', 'Archives privées entrées par don, achat ou dépôt : familles, entreprises, associations', 'Papiers de famille'],
            ['Fi', 'Documents figurés : cartes, plans, cartes postales, photographies', 'Voir le village, la maison'],
            ['Mi', 'Microfilms (copies)', 'Des registres consultables seulement en microfilm']]]];

    function body({site = '', name = ''} = {}) {
        const rows = TABLE.map(([period, list]) => `<tr class="ser-period"><td colspan="3">${esc(i18n(period))}</td></tr>${list.map(([l, what, use]) => `<tr><td class="ser-l"><b>${esc(l)}</b></td><td>${esc(i18n(what))}</td><td>${esc(i18n(use))}</td></tr>`).join('')}`).join('');
        const s = safeUrl(site);
        const acts = [];
        if (ext.archivesDispo) acts.push(`<button type="button" class="button small secondary" data-ser-dispo>${esc(i18n('🏛 Actes en ligne aux archives'))}</button>`);
        if (A()?.setModule) acts.push(`<button type="button" class="button small secondary" data-ser-courriers>${esc(i18n('📮 Actes à demander'))}</button>`);
        return `<div class="ser-help">
            <h3>${esc(i18n('Une série, c’est quoi ?'))}</h3>
            <p>${esc(i18n('Les Archives départementales rangent leurs documents dans un cadre de classement commun à toute la France, fixé en 1841 et complété depuis (dernier texte : circulaire de 1998). Chaque grande famille de documents a sa lettre : c’est la série. Une sous-série ajoute un chiffre devant (3 E, 4 M), puis vient le numéro de l’article : c’est la cote (3 E 12/4).'))}</p>
            <div class="data-table-wrap"><table class="data-table ser-table" data-cols-off><colgroup><col class="ser-c1"><col><col></colgroup><thead><tr><th scope="col">${esc(i18n('Lettre'))}</th><th scope="col">${esc(i18n('Ce qu’on y trouve'))}</th><th scope="col">${esc(i18n('Utile pour le généalogiste'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            <h3>${esc(i18n('Pourquoi ça change d’un département à l’autre'))}</h3>
            <p>${esc(i18n('Chaque département applique ce cadre avec ses propres sous-séries et sa numérotation : les notaires sont en 3 E ici, en 5 E ailleurs ; l’état civil peut être en E, en E-dépôt, ou à consulter en microfilm (Mi). Certaines séries n’existent pas partout.'))}</p>
            <p>${s ? `${esc(i18n('Avant de chercher ou d’écrire, regarde leur cadre de classement et leurs inventaires :'))} ${ext_(s, name ? i18n('Site de « {name} »', {name}) : i18n('Site du service'))}` : esc(i18n('Avant de chercher ou d’écrire, regarde le cadre de classement et les inventaires sur le site des archives du département.'))}</p>
            <h3>${esc(i18n('Pourquoi savoir ce qui est en ligne, sur place ou réservé'))}</h3>
            <p>${esc(i18n('Une partie seulement est numérisée : l’état civil presque partout, souvent les registres matricules et le cadastre. Le reste (notaires, justice, la plupart des W) se consulte en salle de lecture. Et ce qui est trop récent attend la fin de son délai de communicabilité.'))}</p>
            <p>${esc(i18n('Savoir où est quoi évite un déplacement pour rien, et dit quoi demander par courrier (avec la cote).'))}</p>
            ${acts.length ? `<p class="ser-acts">${acts.join('')}</p>` : ''}
            <h3>${esc(i18n('Sources'))}</h3>
            <ul class="ser-sources">
                <li>${esc(i18n('Circulaire du ministre de l’Intérieur du 24 avril 1841 et son cadre de classement (séries A à Z), dans « Lois, instructions et règlements relatifs aux archives départementales, communales et hospitalières », Paris, 1884 :'))} ${ext_(SRC_1841, 'Internet Archive')}</li>
                <li>${esc(i18n('Le cadre actuel (circulaire AD 98-8 du 18 décembre 1998 ; série W créée en 1979 ; E-dépôt, J, Fi, Mi) résumé par Wikipédia, « Archives départementales » :'))} ${ext_(SRC_WIKI, 'Wikipédia')}</li>
                <li>${esc(i18n('Délais de communicabilité : code du patrimoine, art. L213-2 :'))} ${ext_(LEGI, 'Légifrance')}</li>
            </ul></div>`;
    }

    function open(opts = {}) {
        if (!ext.openDialog) return null;
        const dlg = ext.openDialog({eyebrow: i18n('🗂 ARCHIVES'), title: i18n('🗂 Les séries, c’est quoi ?'), wide: true, submitLabel: i18n('Fermer'), onSubmit: () => true, body: body(opts)});
        dlg?.classList.add('ser-dialog');
        dlg?.addEventListener('click', e => {
            const b = e.target.closest('[data-ser-dispo],[data-ser-courriers]'); if (!b) return;
            e.preventDefault();
            document.querySelectorAll('dialog[open]').forEach(d => { if (!d.classList.contains('is-full')) d.close(); });
            if (b.matches('[data-ser-dispo]')) { const S = A().state; S.maintenanceTab = 'archives_dispo'; A().persistUiState?.(); A().setModule?.('maintenance'); }
            else { A().state.listType = 'courriers'; A().setModule('listes'); }
        });
        return dlg;
    }

    /** le petit lien « ⓘ Les séries, c’est quoi ? » ; site/name : ceux du service, s'il en a un */
    function link({site = '', name = ''} = {}) {
        const s = safeUrl(site);
        return `<button type="button" class="link-button ser-link" data-ser-help${s ? ` data-ser-site="${esc(s)}"` : ''}${name ? ` data-ser-name="${esc(name)}"` : ''}>ⓘ ${esc(i18n('Les séries, c’est quoi ?'))}</button>`;
    }

    document.addEventListener('click', e => {
        const b = e.target.closest?.('[data-ser-help]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        open({site: b.dataset.serSite || '', name: b.dataset.serName || ''});
    });

    ext.seriesArchives = {open, link, TABLE};
})();
