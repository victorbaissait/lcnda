/**
 * 📝 Traitement de texte — les onglets de documents (comme les feuilles d'un classeur, en bas) : plusieurs documents ou parties
 * dans un même fichier (« Chapitre 1 », « Notes », « Brouillon »…), un onglet chacun. Clic : y aller ; double-clic : renommer ;
 * clic droit : renommer, dupliquer, déplacer, supprimer ; glisser : ranger ; « ＋ » : un nouvel onglet.
 * Tous les onglets partagent le format des pages, les styles, l'en-tête et le pied ; chacun a son texte (ses sections).
 * Rangement : data.parts = [{name, sections}], data.part = l'onglet ouvert ; data.sections reste celui de l'onglet ouvert
 * (les documents d'avant s'ouvrent comme avant, avec un seul onglet). L'export (Word, PDF…) porte sur l'onglet ouvert.
 */
(() => {
    'use strict';
    const ext = window.LCNDA_EXT = window.LCNDA_EXT || {};
    const A = () => window.LCNDA_APP;
    const K = () => ext.textDocKit;
    const wait = setInterval(() => { const E = K()?.Editor; if (!E || !Object.prototype.hasOwnProperty.call(E.prototype, 'docData')) return; clearInterval(wait); install(E); }, 30);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    function install(Editor) {
        const P = Editor.prototype, open0 = P.open, data0 = P.docData;
        /** les onglets du document (créés à la première ouverture : un seul, « Document ») */
        P.partsInit = function () {
            const d = this.doc, ok = Array.isArray(d.parts) && d.parts.length && d.parts.every(x => x && Array.isArray(x.sections));
            if (!ok) d.parts = [{name: 'Document', sections: d.sections || [{html: ''}]}];
            d.parts = d.parts.slice(0, 60).map((x, i) => ({name: String(x.name || `Onglet ${i + 1}`).slice(0, 60), sections: x.sections.length ? x.sections : [{html: ''}]}));
            d.part = Math.max(0, Math.min(d.parts.length - 1, Number(d.part) || 0)); d.sections = d.parts[d.part].sections;
        };
        /** le texte de l'onglet ouvert, remis dans sa case */
        P.partsSync = function () { const d = this.doc; if (!d.parts) return; d.parts[d.part].sections = data0.call(this).sections; };
        P.open = function (...a) { this.partsInit(); const r = open0.apply(this, a); this.partsBar(); return r; };
        P.docData = function (...a) { const out = data0.apply(this, a); if (!this.doc.parts) return out; this.partsSync(); return {...out, parts: this.doc.parts.map(x => ({name: x.name, sections: x.sections})), part: this.doc.part}; };
        P.partsBar = function () {
            const st = this.status; if (!st) return;
            let bar = this.$('[data-wp-tabs]'); if (!bar) { bar = document.createElement('div'); bar.className = 'wp-tabs'; bar.dataset.wpTabs = ''; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Onglets du document'); st.before(bar); this.partsBind(bar); }
            const d = this.doc; bar.innerHTML = d.parts.map((x, i) => `<button type="button" role="tab" class="wp-tab${i === d.part ? ' is-active' : ''}" aria-selected="${i === d.part}" draggable="true" data-wp-part="${i}" title="Double-clic : renommer · clic droit : plus">${esc(x.name)}</button>`).join('') + '<button type="button" class="wp-tab-add" data-wp-part="add" title="Nouvel onglet" aria-label="Nouvel onglet">＋</button>';
        };
        /** aller à un onglet : le texte de l'onglet ouvert est gardé, l'autre est posé ; ↶ ↷ repartent de là */
        P.partGo = function (i, {sync = true} = {}) {
            const d = this.doc; if ((sync && i === d.part) || !d.parts[i]) return;
            if (sync) { if (this.typeT) this.commit(); this.partsSync(); } // l'onglet quitté garde son texte (sauf s'il vient d'être supprimé)
            d.part = i; d.sections = d.parts[i].sections; this.build(); this.hist = []; this.hpos = -1; this.commit(true); this.layout?.(); this.partsBar(); this.focusEnd?.(false); this.paintPanel?.();
        };
        P.partsChanged = function (msg) { this.touch(); this.partsBar(); if (msg) this.status?.flash?.(msg); };
        P.partAdd = async function (copy = false) {
            const d = this.doc; if (d.parts.length >= 60) return A().toast('60 onglets au plus.', 'error'); this.partsSync();
            const name = await A().askText({message: 'Le nom du nouvel onglet', value: copy ? `${d.parts[d.part].name} (copie)` : `Onglet ${d.parts.length + 1}`}); if (name === null) return;
            d.parts.splice(d.part + 1, 0, {name: String(name).trim().slice(0, 60) || `Onglet ${d.parts.length + 1}`, sections: copy ? JSON.parse(JSON.stringify(d.parts[d.part].sections)) : [{html: ''}]});
            this.touch(); this.partGo(d.part + 1);
        };
        P.partRename = async function (i) { const d = this.doc, name = await A().askText({message: 'Renommer l’onglet', value: d.parts[i].name}); if (name === null || !String(name).trim()) return; d.parts[i].name = String(name).trim().slice(0, 60); this.partsChanged('Onglet renommé'); };
        P.partDelete = async function (i) {
            const d = this.doc; if (d.parts.length < 2) return A().toast('Un document garde au moins un onglet.', 'error');
            if (!await A().confirmBox(`L’onglet « ${d.parts[i].name} » et son texte seront supprimés.`, {title: 'Supprimer l’onglet ?', okLabel: 'Supprimer', danger: true})) return;
            this.partsSync(); const was = d.part; d.parts.splice(i, 1);
            if (i === was) { clearTimeout(this.typeT); this.typeT = 0; this.partGo(Math.max(0, i - 1), {sync: false}); } else { if (i < was) d.part = was - 1; this.partsBar(); }
            this.partsChanged('Onglet supprimé');
        };
        P.partMove = function (from, to) {
            const d = this.doc; if (from === to || !d.parts[from] || !d.parts[to]) return; this.partsSync();
            const cur = d.parts[d.part], [x] = d.parts.splice(from, 1); d.parts.splice(to, 0, x); d.part = d.parts.indexOf(cur); this.partsChanged('Onglets rangés');
        };
        P.partsBind = function (bar) {
            let drag = null;
            bar.addEventListener('click', e => { const b = e.target.closest('[data-wp-part]'); if (!b) return; if (b.dataset.wpPart === 'add') return this.partAdd(); this.partGo(Number(b.dataset.wpPart)); });
            bar.addEventListener('dblclick', e => { const b = e.target.closest('[data-wp-part]'); if (b && b.dataset.wpPart !== 'add') this.partRename(Number(b.dataset.wpPart)); });
            bar.addEventListener('contextmenu', e => { const b = e.target.closest('[data-wp-part]'); if (!b || b.dataset.wpPart === 'add') return; e.preventDefault(); const i = Number(b.dataset.wpPart), n = this.doc.parts.length;
                const items = [{icon: '✏️', label: 'Renommer…', run: () => this.partRename(i)}, {icon: '⧉', label: 'Dupliquer', run: () => { this.partGo(i); this.partAdd(true); }}, {icon: '＋', label: 'Nouvel onglet', run: () => this.partAdd()}, '-',
                    {icon: '◀', label: 'Déplacer à gauche', disabled: i === 0, run: () => this.partMove(i, i - 1)}, {icon: '▶', label: 'Déplacer à droite', disabled: i === n - 1, run: () => this.partMove(i, i + 1)}, '-', {icon: '🗑', label: 'Supprimer…', danger: true, disabled: n < 2, run: () => this.partDelete(i)}];
                if (window.LCNDA_UI?.contextMenu) window.LCNDA_UI.contextMenu(e, items, {title: `« ${this.doc.parts[i].name} »`}); else this.partRename(i); });
            bar.addEventListener('dragstart', e => { const b = e.target.closest('[data-wp-part]'); if (!b || b.dataset.wpPart === 'add') return; drag = Number(b.dataset.wpPart); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.textContent); });
            bar.addEventListener('dragover', e => { if (drag == null) return; e.preventDefault(); bar.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); e.target.closest('[data-wp-part]')?.classList.add('is-drop'); });
            bar.addEventListener('drop', e => { if (drag == null) return; e.preventDefault(); const b = e.target.closest('[data-wp-part]'), to = b && b.dataset.wpPart !== 'add' ? Number(b.dataset.wpPart) : this.doc.parts.length - 1, from = drag; drag = null; this.partMove(from, to); });
            bar.addEventListener('dragend', () => { drag = null; bar.querySelectorAll('.is-drop').forEach(x => x.classList.remove('is-drop')); });
        };
    }
})();
