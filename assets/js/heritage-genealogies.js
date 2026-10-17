/**
 * 🌳 Plusieurs généalogies, complètement séparées (personnes, médias, réglages, sauvegardes ; serveur : lib/paths.php,
 * genealogy_action() dans api.php). Bouton juste après le cadenas « Mode consultation » : la liste, ouvrir, renommer,
 * créer, mettre de côté. Sur l'écran d'installation (généalogie toute neuve), on peut aussi revenir à une autre.
 */
(() => {
    'use strict';
    const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c]));
    const toast = (msg, type) => window.LCNDA_APP?.toast ? window.LCNDA_APP.toast(msg, type) : alert(msg);
    // Confirmation au style de l'app ; confirm() du navigateur seulement si l'app n'est pas chargée
    const ask = (msg, o) => window.LCNDA_APP?.confirmBox ? window.LCNDA_APP.confirmBox(msg, o) : Promise.resolve(confirm(msg));
    // fonctionne aussi sur l'écran d'installation, où l'app n'est pas démarrée
    async function call(action, body = null) {
        const csrf = window.LCNDA_APP?.state?.csrf || window.INSTALL_CSRF || '';
        const r = await fetch(`api.php?action=${action}`, body ? {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify({...body, csrf})} : {});
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(j.error || 'Réponse illisible du serveur.');
        return j;
    }
    const size = b => b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} Mo` : b ? `${Math.max(1, Math.round(b / 1024))} Ko` : 'vide';

    /** Ouvrir une autre généalogie : ses réglages à elle, et on repart de son tableau de bord */
    async function open(id) {
        try {
            await window.LCNDA_SETTINGS_DETACH?.(); // les réglages de celle-ci sont enregistrés, puis détachés
            let detached = true;
            try { await call('genealogy_switch', {id}); detached = false; }
            finally { if (detached) setTimeout(() => location.reload(), 1800); } // échec : on recharge, les réglages reviennent du serveur
            // l'écran ouvert et la fiche choisie sont ceux de l'autre généalogie : on les oublie
            ['genealogie-last-route', 'genealogie-baissait-ui-v2'].forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
            location.href = location.pathname;
        } catch (e) { toast(e.message + ' (la page va se recharger)', 'error'); }
    }

    async function dialog() {
        let data; try { data = await call('genealogies'); } catch (e) { return toast(e.message, 'error'); }
        document.getElementById('h-gen-dialog')?.remove();
        const dl = document.createElement('dialog'); dl.className = 'modal h-modal h-gen-dialog'; dl.id = 'h-gen-dialog';
        dl.innerHTML = `<div class="modal-head"><div><span class="eyebrow">MES GÉNÉALOGIES</span><h2>Changer de généalogie</h2></div><button type="button" class="icon-button" data-x aria-label="Fermer">×</button></div>
            <p class="muted">Chaque généalogie est complètement séparée : ses personnes, ses photos et documents, ses réglages, ses sauvegardes.</p>
            <ol class="h-gen-list">${data.genealogies.map(g => `<li class="${g.active ? 'is-active' : ''}" data-id="${esc(g.id)}">
                <span class="h-gen-ic">🌳</span><div><strong>${esc(g.name)}</strong><small>${g.main ? 'principale · ' : ''}${size(g.size)}${g.active ? ' · ouverte' : ''}</small></div>
                <span class="h-gen-acts">${g.active ? '<b class="h-gen-on">✓ Ouverte</b>' : '<button type="button" class="button small" data-open>Ouvrir</button>'}<button type="button" class="icon-button" data-ren title="Renommer">✎</button>${!g.main && !g.active ? '<button type="button" class="icon-button danger" data-aside title="Mettre de côté (le dossier est gardé, rien n’est effacé)">🗑</button>' : ''}</span></li>`).join('')}</ol>
            <form class="h-gen-new" data-new><label>Nouvelle généalogie<input name="name" maxlength="80" placeholder="Famille de mon conjoint, une étude de village…" required></label><button type="submit" class="button">＋ Créer et ouvrir</button></form>`;
        document.body.appendChild(dl);
        dl.addEventListener('close', () => dl.remove());
        dl.querySelector('[data-x]').addEventListener('click', () => dl.close());
        dl.addEventListener('click', async e => {
            const li = e.target.closest('[data-id]'); if (!li) return;
            const id = li.dataset.id, g = data.genealogies.find(x => x.id === id);
            if (e.target.closest('[data-open]')) { e.target.disabled = true; e.target.textContent = 'Ouverture…'; return open(id); }
            if (e.target.closest('[data-ren]')) {
                const name = window.LCNDA_APP?.askText ? await window.LCNDA_APP.askText({title: 'Renommer la généalogie', message: 'Nouveau nom :', value: g.name, okLabel: 'Renommer'}) : prompt('Nouveau nom :', g.name);
                if (name === null || !String(name).trim()) return;
                try { await call('genealogy_rename', {id, name}); dl.close(); refreshButton(); dialog(); } catch (err) { toast(err.message, 'error'); }
                return;
            }
            if (e.target.closest('[data-aside]')) {
                if (!await ask(`Mettre de côté « ${g.name} » ? Elle disparaît de la liste ; son dossier est gardé (genealogies/_mises-de-cote) et rien n’est effacé.`, {title: 'Mettre de côté', okLabel: 'Mettre de côté', danger: false})) return;
                try { await call('genealogy_remove', {id}); dl.close(); dialog(); toast('Généalogie mise de côté.'); } catch (err) { toast(err.message, 'error'); }
            }
        });
        dl.querySelector('[data-new]').addEventListener('submit', async e => {
            e.preventDefault();
            const name = e.currentTarget.elements.name.value.trim(); if (!name) return;
            try { const r = await call('genealogy_create', {name}); await open(r.id); } catch (err) { toast(err.message, 'error'); }
        });
        dl.showModal();
    }

    async function refreshButton() {
        const btn = document.getElementById('genealogy-switch'); if (!btn) return;
        try {
            const data = await call('genealogies'), cur = data.genealogies.find(g => g.active);
            const label = btn.querySelector('[data-gen-name]');
            if (label) { label.textContent = data.genealogies.length > 1 && cur ? cur.name : ''; label.hidden = !label.textContent; }
            btn.title = `Mes généalogies${cur ? ` (ouverte : ${cur.name})` : ''} : changer, en créer une autre`;
        } catch (_) {}
    }

    /** Écran d'installation d'une généalogie toute neuve : revenir à une autre */
    async function installBlock() {
        const screen = document.getElementById('install-screen'); if (!screen) return;
        let data; try { data = await call('genealogies'); } catch (_) { return; }
        if (data.genealogies.length < 2) return;
        const cur = data.genealogies.find(g => g.active);
        const box = document.createElement('div'); box.className = 'install-card h-gen-install';
        box.innerHTML = `<h3>🌳 Mes généalogies</h3><p class="muted">Tu es dans « ${esc(cur?.name || '')} », encore vide. Pour revenir à une autre :</p>
            <div class="h-gen-install-list">${data.genealogies.filter(g => !g.active).map(g => `<button type="button" class="button secondary small" data-id="${esc(g.id)}">${esc(g.name)}</button>`).join('')}</div>`;
        box.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) open(b.dataset.id); });
        screen.appendChild(box);
    }

    document.addEventListener('click', e => { if (e.target.closest('#genealogy-switch')) dialog(); });
    const start = () => { refreshButton(); installBlock(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    (window.LCNDA_EXT = window.LCNDA_EXT || {}).openGenealogies = dialog;
})();
