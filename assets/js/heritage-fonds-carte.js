/* LCNDA — Réglages › Fonds de cartes : « 🗺 ＋ Ajouter un fond de carte ».
 * Une adresse de tuiles d'un site qui le permet, sans clé (https://…/{z}/{x}/{y}.png ; {s} pour a, b, c ; {-y} pour le format TMS).
 * Ces fonds vont dans la catégorie « Mes fonds de carte » de tous les menus de fonds (Carte, Studio d'animation, diagrammes…),
 * gardés dans ce navigateur (genealogie-tile-user). L'aperçu montre une tuile avant d'ajouter ; retirer → « ↶ Annuler ».
 *   window.LCNDA_EXT.userTiles = {list, add, remove, check, open} */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {}, A = () => window.LCNDA_APP;
    const T = (s, v) => (window.LCNDA_I18N ? window.LCNDA_I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const KEY = 'genealogie-tile-user';
    const list = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
    const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
    /** une adresse acceptable ? → '' si oui, sinon la raison */
    function check(url) {
        const u = String(url || '').trim();
        if (!/^https:\/\/[^\s/]+\.[^\s/]+\//i.test(u)) return T('L’adresse doit commencer par https:// et viser un site.');
        if (!/\{z\}/.test(u) || !/\{x\}/.test(u) || !/\{-?y\}/.test(u)) return T('Il manque {z}, {x} ou {y} dans l’adresse.');
        if (/[{](?!z\}|x\}|-?y\}|s\})/.test(u)) return T('Seuls {z}, {x}, {y}, {-y} et {s} sont compris.');
        if (/[?&](api_?key|key|access_token|token)=/i.test(u)) return T('Cette adresse contient une clé : l’app n’en garde pas (elle se lirait en clair). Choisis un fond sans clé.');
        return '';
    }
    function add({label, url, sub = ''}) {
        const why = check(url); if (why) throw new Error(why);
        const it = {id: 'u_' + Date.now().toString(36), label: String(label || '').trim().slice(0, 80) || T('Mon fond de carte'), url: String(url).trim(), sub: String(sub || '').replace(/[^a-z0-9]/gi, '').slice(0, 8)};
        write([...list(), it]); return it;
    }
    function remove(id) { const before = list(), gone = before.find(x => x.id === id); write(before.filter(x => x.id !== id)); return {gone, undo: () => { if (gone && !list().some(x => x.id === id)) write([...list(), gone]); }}; }
    const sample = url => url.replace('{z}', '5').replace('{x}', '16').replace('{-y}', '20').replace('{y}', '11').replace('{s}', 'a'); // la France, au zoom 5
    function open({onDone} = {}) {
        const dg = document.createElement('dialog'); dg.className = 'modal uft-dlg'; document.body.appendChild(dg);
        const paint = () => {
            const L = list();
            dg.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="eyebrow">${esc(T('Fonds de cartes'))}</span><h2>🗺 ${esc(T('Mes fonds de carte'))}</h2></div><button type="button" class="icon-button" data-uft-x aria-label="${esc(T('Fermer'))}">×</button></div>
                <p class="muted">${esc(T('Ajoute l’adresse de tuiles d’un site qui permet de s’en servir, sans clé. Le fond apparaît dans tous les menus de fonds, dans « Mes fonds de carte ». Pense à citer le site (ses conditions d’utilisation).'))}</p>
                ${L.length ? `<ul class="uft-list">${L.map(u => `<li><b>${esc(u.label)}</b><small class="muted">${esc(u.url)}</small><button type="button" class="button small secondary danger" data-uft-del="${esc(u.id)}">🗑 ${esc(T('Retirer'))}</button></li>`).join('')}</ul>` : ''}
                <div class="form-grid"><label>${esc(T('Nom'))}<input data-uft-label maxlength="80" placeholder="${esc(T('ex. Carte topographique'))}"></label>
                <label class="span-2">${esc(T('Adresse des tuiles'))}<input data-uft-url maxlength="500" placeholder="https://tile.exemple.org/{z}/{x}/{y}.png"></label>
                <label>${esc(T('Sous-domaines {s} (facultatif)'))}<input data-uft-sub maxlength="8" placeholder="abc"></label></div>
                <div class="uft-prev"><span data-uft-msg class="muted"></span><img data-uft-img alt="" hidden></div>
                <div class="modal-actions"><button type="button" class="button secondary" data-uft-try>👁 ${esc(T('Essayer'))}</button><span class="spacer"></span><button type="button" class="button secondary" data-uft-x>${esc(T('Fermer'))}</button><button type="button" class="button" data-uft-add>＋ ${esc(T('Ajouter'))}</button></div></form>`;
        };
        paint(); dg.showModal();
        const close = () => { dg.close(); dg.parentNode?.removeChild(dg); onDone?.(); };
        dg.addEventListener('cancel', e => { e.preventDefault(); close(); });
        const $ = s => dg.querySelector(s);
        dg.addEventListener('click', e => {
            if (e.target.closest('[data-uft-x]')) return close();
            const del = e.target.closest('[data-uft-del]');
            if (del) { const r = remove(del.dataset.uftDel); paint(); onDone?.(); A().undoToast?.(T('Fond « {n} » retiré', {n: r.gone?.label || ''}), {undo: () => { r.undo(); paint(); onDone?.(); }}); return; }
            if (e.target.closest('[data-uft-try]')) {
                const url = $('[data-uft-url]').value, why = check(url), img = $('[data-uft-img]'), msg = $('[data-uft-msg]');
                if (why) { msg.textContent = '⛔ ' + why; img.hidden = true; return; }
                msg.textContent = T('Chargement d’une tuile…'); img.hidden = true;
                img.onload = () => { msg.textContent = '✓ ' + T('La tuile s’affiche.'); img.hidden = false; }; img.onerror = () => { msg.textContent = '⛔ ' + T('Aucune tuile : vérifie l’adresse (ou le site refuse).'); };
                img.referrerPolicy = 'no-referrer'; img.src = sample(url.trim()).replace('{s}', ($('[data-uft-sub]').value || 'a')[0]); return;
            }
            if (e.target.closest('[data-uft-add]')) {
                try { const it = add({label: $('[data-uft-label]').value, url: $('[data-uft-url]').value, sub: $('[data-uft-sub]').value}); paint(); onDone?.();
                    A().undoToast?.(T('Fond « {n} » ajouté', {n: it.label}), {undo: () => { remove(it.id); paint(); onDone?.(); }}); }
                catch (err) { $('[data-uft-msg]').textContent = '⛔ ' + err.message; }
            }
        });
        return dg;
    }
    ext.userTiles = {list, add, remove, check, open};
    document.addEventListener('click', e => { if (e.target.closest?.('[data-tile-user-add]')) { e.preventDefault(); open({onDone: () => A()?.renderDesignTools?.()}); } });
    if (!document.getElementById('uft-css')) { const st = document.createElement('style'); st.id = 'uft-css'; st.textContent = `
.uft-dlg{width:min(720px,96vw)}.uft-list{list-style:none;padding:0;margin:8px 0;display:grid;gap:6px}.uft-list li{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;border:2px solid var(--line,#c9ced8);padding:6px 8px}
.uft-list small{overflow-wrap:anywhere}.uft-prev{display:flex;gap:10px;align-items:center;min-height:40px;margin-top:8px}.uft-prev img{width:128px;height:128px;border:2px solid var(--ink,#111)}
`; document.head.appendChild(st); }
})();
