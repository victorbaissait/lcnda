/* LCNDA — 🖥 Le serveur d'IA locale (serveur : lib/ia_serveur.php ; essai : tests/test-ia-unsloth.js).
 * Réglages → « 🤖 IA » : Ollama (conseillé, par défaut) / Unsloth / autre serveur compatible OpenAI (LM Studio, llama.cpp, Jan…),
 * l'adresse (sur cet ordinateur seulement), une clé d'API locale facultative (Unsloth Studio : « sk-unsloth-… »),
 * « ↻ Tester la connexion », « 🔎 Chercher sur cet ordinateur » (les ports habituels), la liste des modèles du serveur,
 * et « ⓘ Ollama ou Unsloth ? » (une fenêtre qui explique, en mots simples).
 * Le choix est rangé sur l'ordinateur (DATA_DIR commun, genealogie-ia-serveur.json), jamais la clé dans le navigateur.
 * Pour d'autres fichiers : LCNDA_EXT.iaServeur.mount(hôte, {onChange}) · .explain()
 */
(function (root) {
    'use strict';
    const T = (s, v) => { const w = v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? String(x) : x]));
        return root.LCNDA_I18N ? root.LCNDA_I18N.t(s, w) : String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (w && w[k] != null ? w[k] : m)); };
    const A = () => root.LCNDA_APP || {};
    const ext = root.LCNDA_EXT = root.LCNDA_EXT || {};
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const get = (a, q) => A().api(a, q);
    const post = (a, b) => A().api(a, {}, {method: 'POST', body: b}).then(r => (r && r.result !== undefined ? r.result : r));
    const toast = (m, k) => (A().toast ? A().toast(m, k) : null);
    const SRC_UNSLOTH = 'https://github.com/unslothai/unsloth', SRC_OLLAMA = 'https://github.com/ollama/ollama';
    const DEFAULTS = {ollama: 'http://127.0.0.1:11434', unsloth: 'http://127.0.0.1:8888', openai: 'http://127.0.0.1:1234'};
    const NAMES = () => ({ollama: 'Ollama', unsloth: 'Unsloth', openai: T('Serveur compatible OpenAI')});
    const src = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(label || T('source'))}</a>`;

    /** « ⓘ Ollama ou Unsloth ? » : ce que c'est, avantages et inconvénients, en mots simples */
    function explain() {
        const row = (a, b, c) => `<tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`;
        const body = `<div class="ias-explain">
            <p>${esc(T('Les deux font tourner une IA SUR TON ORDINATEUR : gratuites, rien ne part sur Internet (sauf le téléchargement du modèle, une fois). LCNDA sait parler aux deux.'))}</p>
            <h4>🦙 Ollama <small class="muted">(${esc(T('conseillé'))})</small></h4>
            <p>${esc(T('Un petit programme qui télécharge et fait tourner les modèles d’IA, en une commande. C’est celui que LCNDA installe et utilise par défaut.'))}</p>
            <ul><li>👍 ${esc(T('Très simple à installer, marche partout (Mac, Windows, Linux), même sans carte graphique.'))}</li>
                <li>👍 ${esc(T('Énorme catalogue de modèles ; LCNDA peut télécharger le modèle conseillé tout seul.'))}</li>
                <li>👎 ${esc(T('Moins de réglages, et il ne sait pas entraîner un modèle sur tes propres données.'))}</li></ul>
            <h4>🦥 Unsloth <small class="muted">(Unsloth Studio / Desktop)</small></h4>
            <p>${esc(T('Une application avec une interface, qui télécharge et fait tourner les modèles (GGUF, et MLX sur les Mac Apple Silicon), et les sert à LCNDA par une API « compatible OpenAI ».'))}</p>
            <ul><li>👍 ${esc(T('Souvent des modèles plus légers ou mieux compressés (les GGUF « Dynamic » d’Unsloth).'))}</li>
                <li>👍 ${esc(T('Peut aussi ENTRAÎNER un modèle sur tes données, y compris un modèle qui lit les images : utile plus tard pour « 🎓 Entraîner sur mes lignes relues ».'))}</li>
                <li>👎 ${esc(T('Plus récent, installation plus lourde ; le modèle se choisit et se télécharge dans Unsloth, pas depuis LCNDA.'))}</li>
                <li>👎 ${esc(T('L’entraînement demande surtout une carte graphique de PC (NVIDIA ou AMD) ; sur Mac, l’entraînement n’est pas garanti.'))}</li>
                <li>ℹ️ ${esc(T('Unsloth Studio demande en général une clé d’API locale (« sk-unsloth-… », créée dans ses réglages) : colle-la dans LCNDA, elle reste sur cet ordinateur.'))}</li></ul>
            <div class="cplus-scroll"><table class="data-table"><thead><tr><th></th><th>Ollama</th><th>Unsloth</th></tr></thead><tbody>
                ${row(T('Installation'), T('une commande ou un installateur'), T('une commande ou une application (plus lourde)'))}
                ${row(T('Modèles'), T('catalogue Ollama, téléchargé par LCNDA'), T('GGUF (dont « Dynamic »), MLX sur Mac, choisis dans Unsloth'))}
                ${row(T('Entraîner sur mes données'), T('non'), T('oui (surtout avec une carte NVIDIA ou AMD)'))}
                ${row(T('Licence'), 'MIT', T('Apache 2.0 (cœur) et AGPL-3.0 (Studio)'))}
                ${row(T('Prix, vie privée'), T('gratuit, 100 % local'), T('gratuit, 100 % local'))}</tbody></table></div>
            <p><b>${esc(T('En bref'))}</b> : ${esc(T('garde Ollama si tout marche. Essaie Unsloth si tu as une bonne carte graphique et l’envie, plus tard, d’entraîner l’IA sur tes propres actes.'))}</p>
            <p class="muted">${esc(T('Installer Unsloth : macOS ou Linux « curl -fsSL https://unsloth.ai/install.sh | sh » ; Windows (PowerShell) « irm https://unsloth.ai/install.ps1 | iex » ; Homebrew « brew install --cask unsloth ». Puis « unsloth studio -p 8888 » (adresse : http://127.0.0.1:8888).'))}</p>
            <p class="ias-src">${src(SRC_UNSLOTH, 'github.com/unslothai/unsloth')} · ${src(SRC_OLLAMA, 'github.com/ollama/ollama')}</p></div>`;
        if (ext.openDialog) return ext.openDialog({eyebrow: T('IA SUR CET ORDINATEUR'), title: `ⓘ ${T('Ollama ou Unsloth ?')}`, wide: true, body, submitLabel: T('Fermer'), onSubmit: () => true});
        root.alert(T('Ollama ou Unsloth ?'));
        return null;
    }

    /** le résultat d'un test ou d'une recherche, en clair */
    function testHtml(r, name) {
        if (!r) return '';
        if (r.ok) {
            const list = (r.models || []).slice(0, 40).map(m => `<li><code>${esc(m.id)}</code>${m.name !== m.id ? ` → <b>${esc(m.name)}</b> <small class="muted">(${esc(T('reconnu dans la liste conseillée'))})</small>` : ''}${m.vision ? ` · 👁 ${esc(T('lit les images (deviné d’après le nom)'))}` : ''}</li>`).join('');
            return `<div class="aia-notice is-ok" data-ias-result="ok">✓ ${esc(T('{s} répond à {u}.', {s: name, u: r.url}))} ${esc(T('{n} modèle(s) sur ce serveur.', {n: (r.models || []).length}))}${list ? `<ul class="ias-models">${list}</ul>` : `<br><small>${esc(T('Aucun modèle chargé : choisis et lance un modèle dans {s}.', {s: name}))}</small>`}</div>`;
        }
        const msg = r.error === 'unreachable' ? T('Personne ne répond à {u}. Lance {s}, vérifie l’adresse, puis réessaie.', {u: r.url, s: name}) : r.error;
        return `<div class="aia-notice ${r.needs_key ? 'is-warn' : 'is-error'}" data-ias-result="error">${esc(msg)}</div>`;
    }

    /** le panneau de choix, dans l'hôte donné ; opts.onChange() après un enregistrement */
    async function mount(host, opts = {}) {
        if (!host) return;
        let cfg; try { cfg = await get('ia_srv_get'); } catch (e) { host.innerHTML = `<div class="aia-notice is-error">${esc(e.message)}</div>`; return; }
        const names = NAMES();
        const kinds = [['ollama', T('Ollama (conseillé)'), T('le plus simple ; LCNDA télécharge le modèle tout seul')],
            ['unsloth', 'Unsloth', T('Unsloth Studio / Desktop : modèles GGUF « Dynamic », et l’entraînement plus tard')],
            ['openai', T('Autre serveur compatible OpenAI (LM Studio, llama.cpp, Jan…)'), T('tout programme qui répond à /v1/models et /v1/chat/completions')]];
        host.innerHTML = `<h3>🖥 ${esc(T('Le serveur d’IA'))} <button type="button" class="link-button ias-why" data-ias-why>ⓘ ${esc(T('Ollama ou Unsloth ?'))}</button></h3>
            <div class="ias-kinds" role="radiogroup" aria-label="${esc(T('Le serveur d’IA'))}">${kinds.map(([v, l, h]) => `<label class="checkbox-line"><input type="radio" name="ias_kind" value="${v}" ${cfg.kind === v ? 'checked' : ''}> <span><b>${esc(l)}</b><br><small class="muted">${esc(h)}</small></span></label>`).join('')}</div>
            <div class="form-grid ias-form"><label>${esc(T('Adresse du serveur'))}<input type="text" name="ias_url" value="${esc(cfg.url)}" placeholder="${esc(DEFAULTS[cfg.kind])}" spellcheck="false" autocomplete="off" inputmode="url"></label>
                <label data-ias-keyrow ${cfg.kind === 'ollama' ? 'hidden' : ''}>${esc(T('Clé d’API locale (facultative)'))}<input type="password" name="ias_key" value="" autocomplete="off" spellcheck="false" placeholder="${esc(cfg.has_key ? T('•••• déjà enregistrée (laisser vide pour la garder)') : 'sk-unsloth-…')}"></label></div>
            <p class="ui-hint" data-ias-hint></p>
            <div class="aia-row"><button type="button" class="button small" data-ias-save>💾 ${esc(T('Enregistrer'))}</button><button type="button" class="button small secondary" data-ias-test>↻ ${esc(T('Tester la connexion'))}</button><button type="button" class="button small secondary" data-ias-detect>🔎 ${esc(T('Chercher sur cet ordinateur'))}</button></div>
            <div data-ias-out aria-live="polite"></div>
            <p class="ui-hint">🔒 ${esc(T('Seulement sur cet ordinateur (127.0.0.1, localhost ou ::1, en http://) : toute autre adresse est refusée, rien ne part sur Internet. Les règles de vie privée ne changent pas (vivants et fiches 🔒 jamais transmis).'))}</p>`;
        const $ = s => host.querySelector(s);
        const kindNow = () => (host.querySelector('input[name="ias_kind"]:checked') || {}).value || 'ollama';
        const hint = () => {
            const k = kindNow();
            $('[data-ias-keyrow]').hidden = k === 'ollama';
            $('input[name="ias_url"]').placeholder = DEFAULTS[k];
            $('[data-ias-hint]').innerHTML = k === 'unsloth'
                ? `${esc(T('Modèles conseillés dans Unsloth : cherche « Qwen3-VL » (8B, ou 4B pour un ordinateur modeste) en version GGUF « unsloth/… » ; les versions « Dynamic » sont souvent plus légères. Lance-le dans Unsloth : LCNDA reconnaît ces noms et les rattache à la liste conseillée (à comparer sur tes actes).'))} ${src(SRC_UNSLOTH, 'github.com/unslothai/unsloth')}`
                : k === 'openai' ? esc(T('Adresses habituelles : LM Studio http://127.0.0.1:1234, llama.cpp http://127.0.0.1:8080, Jan http://127.0.0.1:1337. Le modèle se charge dans ce programme.'))
                : esc(T('Par défaut : http://127.0.0.1:11434. Le modèle se télécharge depuis LCNDA (installation guidée).'));
        };
        hint();
        const form = () => ({kind: kindNow(), url: $('input[name="ias_url"]').value.trim(), key: $('input[name="ias_key"]').value.trim()});
        const out = $('[data-ias-out]');
        const busy = (b, on) => { if (b) { b.disabled = on; b.setAttribute('aria-busy', on ? 'true' : 'false'); } };
        async function save(f, b) {
            busy(b, true);
            try {
                const r = await post('ia_srv_save', {kind: f.kind, url: f.url, key: f.key, keep_key: f.key === '' ? 1 : 0});
                const before = r.before || {};
                A().undoToast ? A().undoToast(T('Serveur d’IA : {s} ({u}).', {s: names[r.kind] || r.label, u: r.url}), {icon: '🖥', undo: async () => {
                    if (before.saved) await post('ia_srv_save', {kind: before.kind, url: before.url, keep_key: 1}); else await post('ia_srv_reset', {});
                    opts.onChange?.(); }}) : toast(T('Enregistré.'));
                opts.onChange?.();
                return r;
            } catch (e) { out.innerHTML = `<div class="aia-notice is-error" data-ias-result="error">${esc(e.message)}</div>`; return null; } finally { busy(b, false); }
        }
        host.onchange = e => {
            if (e.target.name !== 'ias_kind') return;
            const u = $('input[name="ias_url"]'); const k = kindNow();
            if (!u.value.trim() || Object.values(DEFAULTS).includes(u.value.trim().replace(/\/$/, ''))) u.value = DEFAULTS[k];
            hint(); out.innerHTML = '';
        };
        host.onclick = async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.matches('[data-ias-why]')) return void explain();
            if (b.matches('[data-ias-save]')) return void save(form(), b);
            if (b.matches('[data-ias-test]')) {
                const f = form(); busy(b, true); out.innerHTML = `<p class="muted">${esc(T('Essai de connexion…'))}</p>`;
                try { out.innerHTML = testHtml(await post('ia_srv_test', f), names[f.kind]); } catch (err) { out.innerHTML = `<div class="aia-notice is-error" data-ias-result="error">${esc(err.message)}</div>`; } finally { busy(b, false); }
                return;
            }
            if (b.matches('[data-ias-detect]')) {
                busy(b, true); out.innerHTML = `<p class="muted">${esc(T('Recherche des serveurs d’IA sur cet ordinateur…'))}</p>`;
                try {
                    const r = await post('ia_srv_detect', {});
                    out.innerHTML = r.found.length ? `<div class="aia-notice is-ok" data-ias-found="${r.found.length}"><b>${esc(T('Trouvé sur cet ordinateur :'))}</b><ul>${r.found.map((x, i) => `<li>${esc(x.name)} · <code>${esc(x.url)}</code> · ${x.ok ? esc(T('{n} modèle(s)', {n: x.models})) : esc(T('demande une clé d’API'))} <button type="button" class="button small secondary" data-ias-use="${i}">${esc(T('Utiliser'))}</button></li>`).join('')}</ul></div>`
                        : `<div class="aia-notice is-info" data-ias-found="0">${esc(T('Aucun serveur d’IA trouvé (essayé : {l}). Lance Ollama, Unsloth ou LM Studio, puis réessaie.', {l: r.tried.join(', ')}))}</div>`;
                    out.querySelectorAll('[data-ias-use]').forEach(u => u.addEventListener('click', () => {
                        const x = r.found[Number(u.dataset.iasUse)];
                        const radio = host.querySelector(`input[name="ias_kind"][value="${x.kind}"]`); if (radio) radio.checked = true;
                        $('input[name="ias_url"]').value = x.url; hint();
                        if (x.needs_key) { $('input[name="ias_key"]').focus(); toast(T('Ce serveur demande une clé d’API : colle-la, puis « 💾 Enregistrer ».')); return; }
                        save({kind: x.kind, url: x.url, key: ''}, u);
                    }));
                } catch (err) { out.innerHTML = `<div class="aia-notice is-error">${esc(err.message)}</div>`; } finally { busy(b, false); }
            }
        };
    }

    ext.iaServeur = {mount, explain, defaults: DEFAULTS};
})(typeof window !== 'undefined' ? window : globalThis);
