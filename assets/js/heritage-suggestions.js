/**
 * 💡 Widget « Suggestions de recherche » (tableau de bord) : les trous de la lignée Sosa du de cujus, avec où et quand
 * chercher (serveur : lib/suggestions.php, action research_suggestions).
 * Chargé après app.js (window.LCNDA_APP, window.LCNDA_EXT).
 */
(() => {
    'use strict';
    const A = () => window.LCNDA_APP;
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    ext.dashboard = ext.dashboard || {};
    const esc = value => A().escapeHtml(value ?? '');
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const ICON = {birth: '👶', marriage: '💍', death: '🕯️', parents: '👪'};

    /** « Ton Sosa 18, Pierre Martin, n'a pas de décès : regarde les décès et sépultures de Lille entre 1820 et 1840. » */
    function sentence(it) {
        const f = it.gender === 'female';
        const when = it.from && it.to ? (it.from === it.to ? `en ${it.from}` : `entre ${it.from} et ${it.to}`) : it.from ? `après ${it.from}` : it.to ? `avant ${it.to}` : '';
        const where = it.place ? ` de ${it.place}` : '';
        const whereIn = it.place ? ` à ${it.place}` : '';
        switch (it.kind) {
            case 'birth': return `n’a pas de naissance : cherche son baptême${whereIn} ${when}`.trim();
            case 'marriage': return `n’a pas de mariage : regarde les mariages${where} ${when}`.trim();
            case 'death': return `n’a pas de décès : regarde les décès et sépultures${where} ${when}`.trim();
            default: return `ses parents sont inconnus : ${it.why}${whereIn ? ` (${it.place})` : ''}`;
        }
    }
    function rowsHtml(items) {
        return `<ul class="h-sugg">${items.map(it => `<li><span class="h-sugg-icon" aria-hidden="true">${ICON[it.kind] || '🔎'}</span><div>
            <p>Ton <strong>Sosa ${fmt(it.sosa)}</strong>, <button type="button" class="table-link" data-h-person="${Number(it.person_id)}">${esc(it.name)}</button>, ${esc(sentence(it))}.</p>
            <small class="muted">Génération ${it.generation}${it.kind !== 'parents' && it.why ? ' · d’après : ' + esc(it.why) : ''}</small></div></li>`).join('')}</ul>`;
    }
    ext.dashboard.research_suggestions = {
        load: () => A().api('research_suggestions', {limit: 200}),
        render: (index, widget, span, data) => {
            const items = data?.items || [], limit = Math.max(1, Number(widget.limit) || 8);
            const body = !data ? A().empty('Suggestions indisponibles.')
                : !data.root_id ? A().empty('Choisis d’abord ton de cujus (Sosa n°1) : Réglages → Apparence → Numérotation Sosa.')
                : !items.length ? A().empty('Aucun trou dans ta lignée sur 12 générations : bravo !')
                : rowsHtml(items.slice(0, limit)) + (items.length > limit ? `<p class="h-cw-more"><button type="button" class="link-button" data-sugg-all>Tout voir (${fmt(data.total)})</button></p>` : '');
            return A().card(index, '💡 Suggestions de recherche', data?.total ? fmt(data.total) : '', body, span, '<button type="button" class="button small secondary" data-dashboard-list="sosa">SOSA</button>');
        },
    };
    // « Tout voir » : toutes les suggestions dans une fenêtre
    document.addEventListener('click', async event => {
        if (!event.target.closest?.('[data-sugg-all]')) return;
        let data; try { data = await A().api('research_suggestions', {limit: 200}); } catch (error) { A().toast(error.message, 'error'); return; }
        document.getElementById('h-sugg-dialog')?.remove();
        const dlg = document.createElement('dialog');
        dlg.className = 'modal h-modal h-cw-all-dialog'; dlg.id = 'h-sugg-dialog';
        dlg.innerHTML = `<div class="modal-head"><div><span class="eyebrow">WIDGET</span><h2>💡 Suggestions de recherche <small class="muted">(${fmt(data.total)})</small></h2><p class="muted">Les générations les plus proches d’abord. Les années sont des fenêtres probables, calculées d’après les dates voisines.</p></div><button type="button" class="icon-button" data-close aria-label="Fermer">×</button></div><div class="h-cw-all-body">${rowsHtml(data.items || [])}</div>`;
        document.body.appendChild(dlg);
        dlg.insertAdjacentHTML('beforeend', '<div class="modal-actions"><span class="spacer"></span><button type="button" class="button secondary" data-close>Fermer</button></div>'); // K6 : bas de fenêtre « Fermer »
        dlg.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => dlg.close()));
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
    });
    ext.researchSuggestionSentence = sentence; // pour les tests
})();
