/**
 * 🌐 Mon site web — « Ça marche partout ? » : une petite base à la Can I use (gardée ici, marche sans Internet) de fonctions
 * CSS, HTML et JavaScript récentes ou mal prises en charge, avec la première version qui les gère dans Chrome, Edge, Firefox,
 * Safari (macOS), Safari iOS et Samsung Internet (d'après caniuse et MDN, à jour mi-2026 ; null = jamais).
 * scan() cherche ces fonctions dans le code du site (sans les commentaires, et sans les chaînes quand c'est simple ; le CSS des
 * <style> et style="…", le JS des <script> d'une page sont lus aussi), un résultat par fonction et par fichier, à la ligne de
 * la première occurrence, triés du plus grave (beaucoup de visiteurs touchés) au moins grave.
 * Aussi : ua() (User-Agent plausible), chrome() (barre de fenêtre stylisée au-dessus de l'aperçu), panelHtml() (la liste à lire).
 * Pose window.LCNDA_EXT.siteCompat (et module.exports dans Node, pour les essais).
 */
(function (root) {
    'use strict';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    /** market : part approximative des visites (%), sert à classer par gravité */
    const BROWSERS = [
        {id: 'chrome', name: 'Chrome', icon: '🟡', market: 64, letter: 'C'},
        {id: 'ios', name: 'Safari iOS', icon: '📱', market: 15, letter: 'I'},
        {id: 'edge', name: 'Edge', icon: '🌀', market: 5, letter: 'E'},
        {id: 'safari', name: 'Safari', icon: '🧭', market: 4, letter: 'S'},
        {id: 'firefox', name: 'Firefox', icon: '🦊', market: 2.5, letter: 'F'},
        {id: 'samsung', name: 'Samsung Internet', icon: '🟣', market: 2.2, letter: 'M'},
    ];
    const BY_ID = Object.fromEntries(BROWSERS.map(b => [b.id, b]));
    /** versions minimales visées par défaut : les 2 dernières années (octobre 2024 → aujourd'hui) ; modifiables */
    const DEFAULT_TARGETS = {chrome: 130, edge: 130, firefox: 131, safari: 18, ios: 18, samsung: 27};
    /** versions récentes (mi-2026), pour les User-Agent */
    const CURRENT = {chrome: 149, edge: 149, firefox: 152, safari: 26.5, ios: 26.5, samsung: 29};
    /** Samsung Internet → version de Chromium sur laquelle il repose */
    const SAM = [[56, 7], [59, 8], [63, 9], [67, 10], [71, 11], [75, 12], [79, 13], [87, 14], [90, 15], [92, 16], [96, 17], [99, 18], [102, 19], [106, 20], [110, 21], [111, 22], [115, 23], [117, 24], [121, 25], [122, 26], [125, 27], [130, 28], [136, 29]];
    /** « C105 F121 S15.4 » → {chrome:105, edge:105, firefox:121, safari:15.4, ios:15.4, samsung:20} ; E, I, M déduits s'ils manquent ; « M- » = jamais */
    const since = str => {
        const o = {}; String(str).trim().split(/\s+/).forEach(t => { const b = BROWSERS.find(x => x.letter === t[0]); if (b) o[b.id] = t[1] === '-' ? null : Number(t.slice(1)); });
        for (const b of BROWSERS) if (!(b.id in o)) o[b.id] = null;
        if (!/(^|\s)E/.test(str) && o.chrome != null) o.edge = Math.max(o.chrome, 79);
        if (!/(^|\s)I/.test(str)) o.ios = o.safari;
        if (!/(^|\s)M/.test(str) && o.chrome != null) { const s = SAM.find(([c]) => c >= o.chrome); o.samsung = s ? s[1] : null; }
        return o;
    };
    /** une fonction : test = RegExp (sur la vue du type : css, html ou js), [[vue, RegExp], …] ou v => index (-1 = absente) */
    const F = (id, type, label, sinceStr, test, advice) => ({id, type, label, since: since(sinceStr), test, advice});
    const sansPrefixe = (prop, re) => v => { const m = re.exec(v.css || ''); return m && !new RegExp('-webkit-' + prop + '\\s*:').test(v.css) ? m.index + m[1].length : -1; };
    /** CSS imbriqué : une accolade ouverte alors qu'on est déjà dans une règle de style (pas dans @media, @keyframes…) */
    const nesting = v => {
        const s = v.css || '', st = []; let start = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (c === '{') { const pre = s.slice(start, i), lead = pre.search(/\S/); if (st.length && st[st.length - 1] === 'rule') return start + Math.max(lead, 0); st.push(/^\s*@/.test(pre) ? (/^\s*@(media|supports|container|layer|scope|starting-style|document)\b/.test(pre) ? 'group' : 'at') : 'rule'); start = i + 1; }
            else if (c === '}') { st.pop(); start = i + 1; }
            else if (c === ';') start = i + 1;
        }
        return -1;
    };
    /** un attribut posé dans une balise (pas dans le texte) */
    const attr = re => new RegExp('<[a-z][\\w-]*\\b[^>]*\\s' + re.source, 'i');
    const FEATURES = [
        /* ── CSS ── */
        F('css-has', 'css', ':has() (parent qui contient…)', 'C105 F121 S15.4', /:has\(/, 'Prévois un style correct sans :has() (il sera ignoré sur les vieux Firefox).'),
        F('css-container', 'css', '@container (requêtes de conteneur)', 'C105 F110 S16', /@container\b|\bcontainer(-type|-name)?\s*:/, 'Marche partout depuis 2023 ; garde une mise en page lisible sans.'),
        F('css-container-style', 'css', '@container style() (requêtes de style)', 'C111 F- S18', /@container\b[^{]*\bstyle\(/, 'Pas sur Firefox : utilise une classe à la place.'),
        F('css-container-scroll', 'css', '@container scroll-state()', 'C133 F- S-', /\bscroll-state\(/, 'Seulement Chrome et Edge : ne compte pas dessus.'),
        F('css-cq-units', 'css', 'unités cqw, cqh, cqi, cqb', 'C105 F110 S16', /\d(cqw|cqh|cqi|cqb|cqmin|cqmax)\b/, 'Marche partout depuis 2023.'),
        F('css-nesting', 'css', 'CSS imbriqué (nesting)', 'C120 F117 S17.2', nesting, 'Marche partout depuis fin 2023 ; pour les plus vieux navigateurs, écris les sélecteurs en entier.'),
        F('css-subgrid', 'css', 'subgrid', 'C117 F71 S16', /grid-template-(columns|rows)\s*:\s*subgrid\b/, 'Marche partout depuis 2023.'),
        F('css-color-mix', 'css', 'color-mix()', 'C111 F113 S16.2', /\bcolor-mix\(/, 'Marche partout depuis 2023 ; mets une couleur simple juste avant pour les plus vieux.'),
        F('css-oklch', 'css', 'couleurs oklch(), oklab(), lab(), lch()', 'C111 F113 S15.4', /\b(ok)?(lch|lab)\(/, 'Marche partout depuis 2023 ; mets une couleur #hex juste avant pour les plus vieux.'),
        F('css-relative-color', 'css', 'couleur relative (rgb(from …))', 'C122 F128 S18', /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(\s*from\b/, 'Récent : mets une couleur fixe juste avant.'),
        F('css-hwb', 'css', 'couleurs hwb()', 'C101 F96 S15', /\bhwb\(/, 'Marche partout depuis 2022.'),
        F('css-light-dark', 'css', 'light-dark()', 'C123 F120 S17.5 M27', /\blight-dark\(/, 'Récent : mets une couleur fixe juste avant, ou utilise @media (prefers-color-scheme).'),
        F('css-text-balance', 'css', 'text-wrap: balance', 'C114 F121 S17.5', /\btext-wrap(-style)?\s*:\s*balance\b/, 'Sans risque : les vieux navigateurs coupent les titres comme avant.'),
        F('css-text-pretty', 'css', 'text-wrap: pretty', 'C117 F- S26', /\btext-wrap(-style)?\s*:\s*pretty\b/, 'Sans risque : ignoré là où ça ne marche pas.'),
        F('css-layer', 'css', '@layer (couches de styles)', 'C99 F97 S15.4', /@layer\b/, 'Marche partout depuis 2022.'),
        F('css-scope', 'css', '@scope', 'C118 F146 S17.4', /@scope\b/, 'Récent sur Firefox : préfère des classes bien nommées si tu vises de vieux Firefox.'),
        F('css-property', 'css', '@property (variables typées)', 'C85 F128 S16.4', /@property\b/, 'Marche partout depuis 2024 ; donne une valeur de départ à la variable.'),
        F('css-anchor', 'css', 'ancrage CSS (anchor positioning)', 'C125 F147 S26 M27', /\banchor-name\s*:|\bposition-anchor\s*:|\banchor\(|\bposition-area\s*:|\bposition-try/, 'Très récent : prévois une position de repli (position: absolute classique).'),
        F('css-view-transition-mpa', 'css', '@view-transition (transitions entre pages)', 'C126 F- S18.2', /@view-transition\b/, 'Sans risque : les pages changent sans animation là où ça ne marche pas.'),
        F('css-scroll-timeline', 'css', 'animations liées au défilement', 'C115 F- S26', /\banimation-timeline\s*:|\b(scroll|view)-timeline(-name)?\s*:|\banimation-range\s*:/, 'Pas sur Firefox : le contenu doit rester visible sans l\'animation.'),
        F('css-viewport-units', 'css', 'unités dvh, svh, lvh', 'C108 F101 S15.4', /\d(d|s|l)v(h|w|i|b|min|max)\b/, 'Marche partout depuis 2023 ; mets 100vh juste avant pour les plus vieux.'),
        F('css-focus-visible', 'css', ':focus-visible', 'C86 F85 S15.4', /:focus-visible\b/, 'Marche partout depuis 2022.'),
        F('css-backdrop-filter', 'css', 'backdrop-filter sans -webkit-', 'C76 F103 S18', sansPrefixe('backdrop-filter', /(^|[^-\w])backdrop-filter\s*:/m), 'Ajoute aussi -webkit-backdrop-filter (Safari avant 18).'),
        F('css-mask', 'css', 'mask / mask-image sans -webkit-', 'C120 F53 S15.4', sansPrefixe('mask(-image)?', /(^|[^-\w])mask(-image)?\s*:/m), 'Ajoute aussi -webkit-mask-image pour les Chrome un peu anciens.'),
        F('css-user-select', 'css', 'user-select sans -webkit-', 'C54 F69 S- I-', sansPrefixe('user-select', /(^|[^-\w])user-select\s*:/m), 'Ajoute -webkit-user-select : Safari n\'a toujours que celui-là.'),
        F('css-flex-gap', 'css', 'gap en flexbox', 'C84 F63 S14.1 I14.5', v => { const s = v.css || ''; if (!/display\s*:\s*(inline-)?flex\b/.test(s)) return -1; const m = /(^|[;{\s])((row-|column-)?gap)\s*:/m.exec(s); return m ? m.index + m[1].length : -1; }, 'Marche partout depuis 2021.'),
        F('css-aspect-ratio', 'css', 'aspect-ratio', 'C88 F89 S15', /\baspect-ratio\s*:/, 'Marche partout depuis 2021.'),
        F('css-inset', 'css', 'inset', 'C87 F66 S14.1 I14.5', /(^|[;{\s])inset\s*:/m, 'Marche partout depuis 2021.'),
        F('css-accent-color', 'css', 'accent-color', 'C93 F92 S15.4', /\baccent-color\s*:/, 'Marche partout depuis 2022.'),
        F('css-field-sizing', 'css', 'field-sizing (champs qui grandissent)', 'C123 F- S- M27', /\bfield-sizing\s*:/, 'Pas sur Firefox ni Safari : donne une hauteur normale au champ.'),
        F('css-starting-style', 'css', '@starting-style', 'C117 F129 S17.5', /@starting-style\b/, 'Sans risque : pas d\'animation d\'entrée là où ça ne marche pas.'),
        F('css-allow-discrete', 'css', 'transition-behavior: allow-discrete', 'C117 F129 S17.4', /\ballow-discrete\b/, 'Sans risque : l\'élément apparaît sans transition ailleurs.'),
        F('css-interpolate-size', 'css', 'interpolate-size / calc-size()', 'C129 F- S-', /\binterpolate-size\s*:|\bcalc-size\(/, 'Seulement Chrome et Edge : l\'ouverture se fera sans animation ailleurs.'),
        F('css-user-invalid', 'css', ':user-invalid / :user-valid', 'C119 F88 S16.5', /:user-(in)?valid\b/, 'Marche partout depuis fin 2023.'),
        F('css-text-box', 'css', 'text-box-trim (rognage du texte)', 'C133 F- S18.2', /\btext-box(-trim|-edge)?\s*:/, 'Pas sur Firefox : sans risque, juste un peu plus d\'espace.'),
        F('css-is-where', 'css', ':is() / :where()', 'C88 F78 S14', /:(is|where)\(/, 'Marche partout depuis 2021.'),
        F('css-clamp', 'css', 'clamp(), min(), max()', 'C79 F75 S13.1 I13.4', /\b(clamp|min|max)\(/, 'Marche partout depuis 2020.'),
        F('css-trig', 'css', 'sin(), cos(), tan(), pow(), sqrt()…', 'C111 F108 S15.4', /\b(sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp)\(/, 'Marche partout depuis 2023.'),
        F('css-round', 'css', 'round(), mod(), rem()', 'C125 F118 S15.4 M27', /\b(round|mod|rem)\(/, 'Récent sur Chrome : mets une valeur fixe juste avant.'),
        F('css-nth-of', 'css', ':nth-child(… of S)', 'C111 F113 S9', /:nth-(last-)?child\([^)]*\bof\b/, 'Marche partout depuis 2023.'),
        F('css-scrollbar-gutter', 'css', 'scrollbar-gutter', 'C94 F97 S-', /\bscrollbar-gutter\s*:/, 'Pas sur Safari : sans risque.'),
        F('css-scrollbar-color', 'css', 'scrollbar-color / scrollbar-width', 'C121 F64 S-', /\bscrollbar-(color|width)\s*:/, 'Pas sur Safari : ajoute ::-webkit-scrollbar si tu y tiens.'),
        F('css-overscroll', 'css', 'overscroll-behavior', 'C63 E18 F59 S16', /\boverscroll-behavior(-x|-y|-inline|-block)?\s*:/, 'Marche partout depuis 2022.'),
        F('css-content-visibility', 'css', 'content-visibility', 'C85 F125 S18', /\bcontent-visibility\s*:/, 'Sans risque : juste un peu plus lent ailleurs.'),
        F('css-color-scheme', 'css', 'color-scheme', 'C81 F96 S13', /\bcolor-scheme\s*:/, 'Marche partout depuis 2022.'),
        F('css-initial-letter', 'css', 'initial-letter (lettrine)', 'C110 F- S17', /\binitial-letter\s*:/, 'Pas sur Firefox : prévois une lettrine avec ::first-letter et float.'),
        F('css-linear-easing', 'css', 'linear() (courbes d\'animation)', 'C113 F112 S17.2', /\blinear\(/, 'Marche partout depuis fin 2023.'),
        F('css-transform-props', 'css', 'translate, rotate, scale séparés', 'C104 F72 S14.1 I14.5', /(^|[;{\s])(translate|rotate|scale)\s*:/m, 'Marche partout depuis 2022.'),
        F('css-media-range', 'css', '@media (width >= …) (comparaisons)', 'C104 F63 S16.4', /@media[^{]*\([^)]*[<>]=?[^)]*\)/, 'Marche partout depuis 2023 ; sinon écris (min-width: …).'),
        F('css-supports-selector', 'css', '@supports selector()', 'C83 F69 S14.1 I14.5', /@supports[^{]*\bselector\(/, 'Marche partout depuis 2021.'),
        F('css-dir', 'css', ':dir()', 'C120 F49 S16.4', /:dir\(/, 'Marche partout depuis 2024 ; sinon [dir="rtl"].'),
        F('css-lh', 'css', 'unités lh, rlh', 'C109 F120 S16.4', /\d(r?lh)\b/, 'Marche partout depuis 2024.'),
        F('css-font-size-adjust', 'css', 'font-size-adjust', 'C127 F3 S17 M28', /\bfont-size-adjust\s*:/, 'Sans risque : ignoré ailleurs.'),
        F('css-zoom', 'css', 'zoom', 'C1 E12 F126 S3.1 I3', /(^|[;{\s])zoom\s*:/m, 'Firefox ne le gère que depuis 2024 : préfère transform: scale() si besoin.'),
        F('css-details-content', 'css', '::details-content', 'C131 F143 S18.4', /::details-content\b/, 'Récent : le contenu s\'ouvrira sans animation ailleurs.'),
        F('css-custom-select', 'css', 'appearance: base-select (menus stylés)', 'C135 F- S-', /\bappearance\s*:\s*base-select\b|::picker\(/, 'Seulement Chrome et Edge : le menu reste normal ailleurs (sans risque).'),
        F('css-shape', 'css', 'shape()', 'C135 F- S18.4', /\bshape\(/, 'Prévois un polygon() juste avant.'),
        F('css-attr-typed', 'css', 'attr() hors de content', 'C133 F- S-', v => { const m = /(^|[;{\s])([a-z-]+)\s*:[^;{}]*\battr\(/m.exec(v.css || ''); return m && m[2] !== 'content' ? m.index + m[1].length : -1; }, 'Seulement Chrome et Edge : mets une valeur fixe juste avant.'),
        F('css-if', 'css', 'if() en CSS', 'C137 F- S-', /:\s*[^;{}]*\bif\(/, 'Seulement Chrome et Edge : mets une valeur fixe juste avant.'),
        F('css-sibling-index', 'css', 'sibling-index() / sibling-count()', 'C138 F- S-', /\bsibling-(index|count)\(/, 'Seulement Chrome et Edge.'),
        F('css-highlight', 'css', '::highlight()', 'C105 F140 S17.2', /::highlight\(/, 'Récent sur Firefox : le texte ne sera pas surligné ailleurs.'),
        F('css-reading-flow', 'css', 'reading-flow', 'C137 F- S-', /\breading-(flow|order)\s*:/, 'Seulement Chrome et Edge : garde un ordre du code logique.'),
        /* ── HTML ── */
        F('html-popover', 'html', 'popover (bulles sans JavaScript)', 'C114 F125 S17', attr(/(popover|popovertarget)(\s*=|[\s>\/])/), 'Marche partout depuis 2024 ; sur les plus vieux, la bulle reste cachée.'),
        F('html-dialog', 'html', '<dialog>', 'C37 E79 F98 S15.4 M3', /<dialog\b/i, 'Marche partout depuis 2022.'),
        F('html-dialog-closedby', 'html', '<dialog closedby>', 'C134 F141 S-', /<dialog\b[^>]*\sclosedby\b/i, 'Ajoute un vrai bouton « Fermer ».'),
        F('html-details-name', 'html', '<details name=…> (accordéon exclusif)', 'C120 F130 S17.2', /<details\b[^>]*\sname\s*=/i, 'Sans risque : ailleurs, plusieurs volets peuvent rester ouverts.'),
        F('html-lazy-img', 'html', 'loading="lazy" sur les images', 'C77 E79 F75 S15.4', /<img\b[^>]*\sloading\s*=\s*["']?lazy/i, 'Marche partout depuis 2022.'),
        F('html-lazy-iframe', 'html', 'loading="lazy" sur les cadres (iframe)', 'C77 E79 F121 S16.4', /<iframe\b[^>]*\sloading\s*=\s*["']?lazy/i, 'Sans risque : chargé tout de suite ailleurs.'),
        F('html-inert', 'html', 'inert', 'C102 F112 S15.5', attr(/inert(\s*=|[\s>\/])/), 'Marche partout depuis 2023.'),
        F('html-importmap', 'html', 'import maps (<script type="importmap">)', 'C89 F108 S16.4', /<script\b[^>]*\btype\s*=\s*["']?importmap/i, 'Marche partout depuis 2023.'),
        F('html-fetchpriority', 'html', 'fetchpriority', 'C101 F132 S17.2', attr(/fetchpriority\s*=/), 'Sans risque : ignoré ailleurs.'),
        F('html-search', 'html', '<search>', 'C118 F118 S17', /<search\b/i, 'Ajoute role="search" pour les plus vieux.'),
        F('html-command', 'html', 'commandfor / command (boutons sans JS)', 'C135 F144 S26.2', attr(/commandfor\s*=/), 'Très récent : garde un petit script de repli.'),
        F('html-interestfor', 'html', 'interestfor (bulles au survol)', 'C142 F- S-', attr(/interestfor\s*=/), 'Seulement Chrome et Edge.'),
        F('html-until-found', 'html', 'hidden="until-found"', 'C102 F139 S-', attr(/hidden\s*=\s*["']?until-found/), 'Pas sur Safari : le texte restera caché à la recherche.'),
        F('html-switch', 'html', '<input switch> (interrupteur)', 'C- E- F- S17.4 M-', /<input\b[^>]*\sswitch(\s*=|[\s>\/])/i, 'Seulement Safari : ailleurs c\'est une case à cocher normale.'),
        F('html-blocking', 'html', 'blocking="render"', 'C105 F- S-', attr(/blocking\s*=\s*["']?render/), 'Seulement Chrome et Edge.'),
        F('html-avif', 'html', 'images AVIF', 'C85 E121 F93 S16.4 M14', [['html', /\.avif\b/i], ['cssRaw', /\.avif\b/i]], 'Marche partout depuis 2023 ; garde une version JPEG dans un <picture>.'),
        F('html-webp', 'html', 'images WebP', 'C32 E18 F65 S14 M4', [['html', /\.webp\b/i], ['cssRaw', /\.webp\b/i]], 'Marche partout depuis 2020.'),
        F('html-modulepreload', 'html', '<link rel="modulepreload">', 'C66 F115 S17', /<link\b[^>]*\brel\s*=\s*["']?modulepreload/i, 'Sans risque : ignoré ailleurs.'),
        F('html-speculation', 'html', 'règles de préchargement (speculationrules)', 'C109 F- S-', /<script\b[^>]*\btype\s*=\s*["']?speculationrules/i, 'Sans risque : ignoré ailleurs.'),
        F('html-enterkeyhint', 'html', 'enterkeyhint', 'C77 F94 S13.1', attr(/enterkeyhint\s*=/), 'Marche partout.'),
        /* ── JavaScript ── */
        F('js-structured-clone', 'js', 'structuredClone()', 'C98 F94 S15.4', /\bstructuredClone\(/, 'Marche partout depuis 2022.'),
        F('js-array-at', 'js', 'Array.prototype.at()', 'C92 F90 S15.4', /\.at\(/, 'Marche partout depuis 2022.'),
        F('js-find-last', 'js', 'findLast() / findLastIndex()', 'C97 F104 S15.4', /\.findLast(Index)?\(/, 'Marche partout depuis 2022.'),
        F('js-change-by-copy', 'js', 'toSorted(), toReversed(), toSpliced(), with()', 'C110 F115 S16', /\.(toSorted|toReversed|toSpliced)\(|\.with\(\s*-?\d/, 'Marche partout depuis 2023 ; sinon [...t].sort().'),
        F('js-has-own', 'js', 'Object.hasOwn()', 'C93 F92 S15.4', /\bObject\.hasOwn\(/, 'Marche partout depuis 2022.'),
        F('js-with-resolvers', 'js', 'Promise.withResolvers()', 'C119 F121 S17.4', /\bPromise\.withResolvers\(/, 'Marche partout depuis 2024 ; sinon new Promise((res, rej) => …).'),
        F('js-promise-try', 'js', 'Promise.try()', 'C128 F134 S18.2', /\bPromise\.try\(/, 'Récent : sinon new Promise(r => r(f())).'),
        F('js-tla', 'js', 'await au premier niveau (top-level await)', 'C89 F89 S15', /^(?:export\s+)?(?:(?:const|let|var)\s+[^=;]+=\s*)?await\s/m, 'Seulement dans un <script type="module"> ; marche partout depuis 2022.'),
        F('js-segmenter', 'js', 'Intl.Segmenter', 'C87 F125 S14.1 I14.5', /\bIntl\.Segmenter\b/, 'Firefox ne l\'a que depuis 2024.'),
        F('js-duration-format', 'js', 'Intl.DurationFormat', 'C129 F136 S16.4 M28', /\bIntl\.DurationFormat\b/, 'Récent : écris la durée à la main pour les plus vieux.'),
        F('js-abort-timeout', 'js', 'AbortSignal.timeout()', 'C103 F100 S16', /\bAbortSignal\.timeout\(/, 'Marche partout depuis 2022.'),
        F('js-abort-any', 'js', 'AbortSignal.any()', 'C116 F124 S17.4', /\bAbortSignal\.any\(/, 'Marche partout depuis 2024.'),
        F('js-navigation', 'js', 'Navigation API (navigation.…)', 'C102 F147 S26.2', /(^|[^.\w$])navigation\.(navigate|addEventListener|entries|currentEntry|back|forward|traverseTo|reload|updateCurrentEntry)\b|\bNavigateEvent\b/m, 'Très récent sur Firefox et Safari : garde des liens normaux.'),
        F('js-view-transition', 'js', 'transitions de vue (startViewTransition)', 'C111 F144 S18', [['js', /\.startViewTransition\(/], ['css', /::view-transition|\bview-transition-(name|class)\s*:/]], 'Vérifie que document.startViewTransition existe avant de l\'appeler.'),
        F('js-group-by', 'js', 'Object.groupBy() / Map.groupBy()', 'C117 F119 S17.4', /\b(Object|Map)\.groupBy\(/, 'Marche partout depuis 2024.'),
        F('js-from-async', 'js', 'Array.fromAsync()', 'C121 F115 S16.4', /\bArray\.fromAsync\(/, 'Marche partout depuis 2024.'),
        F('js-set-methods', 'js', 'Set : union(), intersection()…', 'C122 F127 S17', /\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, 'Firefox ne l\'a que depuis l\'été 2024.'),
        F('js-well-formed', 'js', 'isWellFormed() / toWellFormed()', 'C111 F119 S16.4', /\.(is|to)WellFormed\(/, 'Marche partout depuis 2023.'),
        F('js-iterator-helpers', 'js', 'Iterator.from(), .values().map()…', 'C122 F131 S18.4', /\bIterator\.from\(|\.(values|keys|entries)\(\)\s*\.(map|filter|take|drop|flatMap|reduce|toArray|forEach|some|every|find)\(/, 'Récent sur Safari : passe par [...it] pour les plus vieux.'),
        F('js-regexp-escape', 'js', 'RegExp.escape()', 'C136 F134 S18.2', /\bRegExp\.escape\(/, 'Récent : sinon s.replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\\\$&\').'),
        F('js-float16', 'js', 'Float16Array', 'C135 F129 S18.2', /\bFloat16Array\b/, 'Récent.'),
        F('js-error-iserror', 'js', 'Error.isError()', 'C134 F138 S-', /\bError\.isError\(/, 'Pas sur Safari : utilise instanceof Error.'),
        F('js-temporal', 'js', 'Temporal (dates)', 'C144 F139 S-', /\bTemporal\.\w/, 'Pas sur Safari : utilise Date ou une petite bibliothèque.'),
        F('js-base64', 'js', 'Uint8Array.fromBase64() / toBase64()', 'C140 F133 S18.2 M-', /\bUint8Array\.from(Base64|Hex)\(|\.to(Base64|Hex)\(/, 'Récent : sinon btoa() / atob().'),
        F('js-optional-chaining', 'js', 'chaînage optionnel ?.', 'C80 F74 S13.1 I13.4', /[\w\])]\?\.(?!\d)/, 'Marche partout depuis 2020.'),
        F('js-nullish', 'js', 'opérateur ??', 'C80 F72 S13.1 I13.4', /\?\?(?!=)/, 'Marche partout depuis 2020.'),
        F('js-logical-assign', 'js', 'affectations ??=, ||=, &&=', 'C85 F79 S14', /(\?\?|\|\||&&)=/, 'Marche partout depuis 2021.'),
        F('js-private-fields', 'js', 'champs privés de classe (#x)', 'C74 F90 S14.1 I14.5', /\bthis\.#[A-Za-z_]|^\s*(static\s+)?#[A-Za-z_]\w*\s*[=;(]/m, 'Marche partout depuis 2021.'),
        F('js-static-block', 'js', 'blocs static { } de classe', 'C94 F93 S16.4', /\bstatic\s*\{/, 'Marche partout depuis 2023.'),
        F('js-replace-all', 'js', 'replaceAll()', 'C85 F77 S13.1 I13.4', /\.replaceAll\(/, 'Marche partout depuis 2020.'),
        F('js-promise-any', 'js', 'Promise.any()', 'C85 F79 S14', /\bPromise\.any\(|\bAggregateError\b/, 'Marche partout depuis 2021.'),
        F('js-weakref', 'js', 'WeakRef / FinalizationRegistry', 'C84 F79 S14.1 I14.5', /\bnew\s+(WeakRef|FinalizationRegistry)\b/, 'Marche partout depuis 2021.'),
        F('js-idle-callback', 'js', 'requestIdleCallback()', 'C47 E79 F55 S- I- M5', /\brequestIdleCallback\s*\(/, 'Pas sur Safari : vérifie qu\'il existe, sinon setTimeout(f, 1).'),
        F('js-web-share', 'js', 'navigator.share() (partager)', 'C89 E93 F- S12.1 I12.2 M8', /\bnavigator\.share\s*\(/, 'Pas sur Firefox (ordinateur) : cache le bouton si navigator.share n\'existe pas.'),
        F('js-highlight', 'js', 'CSS.highlights (surlignage)', 'C105 F140 S17.2', /\bCSS\.highlights\b|\bnew\s+Highlight\s*\(/, 'Récent sur Firefox.'),
        F('js-check-visibility', 'js', 'checkVisibility()', 'C105 F106 S17.4', /\.checkVisibility\(/, 'Marche partout depuis 2024.'),
        F('js-scrollend', 'js', 'évènement scrollend', 'C114 F109 S-', [['jsRaw', /['"`]scrollend['"`]/], ['js', /\bonscrollend\b/]], 'Pas sur Safari : garde un minuteur après scroll.'),
        F('js-show-picker', 'js', 'showPicker()', 'C99 F101 S16', /\.showPicker\(/, 'Marche partout depuis 2023.'),
        F('js-eyedropper', 'js', 'EyeDropper (pipette)', 'C95 F- S-', /\bEyeDropper\b/, 'Seulement Chrome et Edge sur ordinateur : vérifie qu\'il existe.'),
        F('js-compression', 'js', 'CompressionStream', 'C80 F113 S16.4', /\b(Compression|Decompression)Stream\b/, 'Marche partout depuis 2023.'),
        F('js-url-canparse', 'js', 'URL.canParse() / URL.parse()', 'C126 F126 S18 M28', /\bURL\.(canParse|parse)\(/, 'Récent : sinon try { new URL(…) } catch.'),
        F('js-scheduler', 'js', 'scheduler.postTask() / yield()', 'C129 F142 S-', /\bscheduler\.(postTask|yield)\(/, 'Pas sur Safari : vérifie qu\'il existe.'),
        F('js-random-uuid', 'js', 'crypto.randomUUID()', 'C92 F95 S15.4', /\bcrypto\.randomUUID\(/, 'Marche partout depuis 2022 (seulement en https).'),
        F('js-close-watcher', 'js', 'CloseWatcher', 'C126 F- S-', /\bCloseWatcher\b/, 'Seulement Chrome et Edge.'),
        F('js-move-before', 'js', 'moveBefore()', 'C133 F144 S-', /\.moveBefore\(/, 'Pas sur Safari : utilise insertBefore().'),
    ];

    /* ── lecture du code : vues de même longueur que le texte (les numéros de ligne restent justes) ── */
    const blank = (a, i, j) => { for (let k = i; k < j && k < a.length; k++) if (a[k] !== '\n') a[k] = ' '; };
    /** commentaires (et chaînes si keepStrings est faux) remplacés par des espaces ; js : aussi // et les `…` */
    const strip = (text, js, keepStrings) => {
        const a = String(text).split(''), n = a.length;
        for (let i = 0; i < n;) {
            const c = a[i], d = a[i + 1];
            if (c === '/' && d === '*') { const e = String(text).indexOf('*/', i + 2), end = e < 0 ? n : e + 2; blank(a, i, end); i = end; }
            else if (js && c === '/' && d === '/') { let e = i; while (e < n && a[e] !== '\n') e++; blank(a, i, e); i = e; }
            else if (c === '"' || c === "'" || (js && c === '`')) { let e = i + 1; while (e < n && a[e] !== c && (c === '`' || a[e] !== '\n')) e += a[e] === '\\' ? 2 : 1; if (!keepStrings) blank(a, i + 1, e); i = e + 1; }
            else i++;
        }
        return a.join('');
    };
    const views = (kind, text) => {
        const t = String(text ?? '');
        if (kind === 'css') return {css: strip(t, false, false), cssRaw: strip(t, false, true)};
        if (kind === 'js') return {js: strip(t, true, false), jsRaw: strip(t, true, true)};
        const h = t.split(''); let m;
        for (const re of [/<!--[\s\S]*?(-->|$)/g, /<\?(php|=)?[\s\S]*?(\?>|$)/g]) while ((m = re.exec(t))) { blank(h, m.index, m.index + m[0].length); if (!m[0].length) re.lastIndex++; }
        const s = h.join(''), css = t.replace(/[^\n]/g, ' ').split(''), js = css.slice();
        const copy = (dst, i, j) => { for (let k = i; k < j; k++) dst[k] = s[k]; };
        const re = /<(style|script)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
        while ((m = re.exec(s))) {
            const i = m.index + m[0].indexOf('>') + 1, j = i + m[3].length;
            if (m[1].toLowerCase() === 'style') copy(css, i, j);
            else if (!/\btype\s*=/i.test(m[2]) || /\btype\s*=\s*["']?(module|text\/javascript|application\/javascript)\b/i.test(m[2])) copy(js, i, j);
            blank(h, i, j);
        }
        const sa = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi;
        while ((m = sa.exec(s))) { const i = m.index + m[0].length - m[1].length + 1; copy(css, i, i + m[1].length - 2); }
        const cssT = css.join(''), jsT = js.join('');
        return {html: h.join(''), css: strip(cssT, false, false), cssRaw: strip(cssT, false, true), js: strip(jsT, true, false), jsRaw: strip(jsT, true, true)};
    };
    const DEF_VIEW = {css: 'css', html: 'html', js: 'js'};
    const find = (f, v) => {
        try {
            if (typeof f.test === 'function') return f.test(v);
            const pairs = f.test instanceof RegExp ? [[DEF_VIEW[f.type], f.test]] : f.test;
            let best = -1;
            for (const [k, re] of pairs) { if (typeof v[k] !== 'string') continue; const m = re.exec(v[k]); if (m && (best < 0 || m.index < best)) best = m.index; }
            return best;
        } catch (_) { return -1; }
    };
    const lineOf = (text, i) => { let l = 1; for (let k = 0; k < i; k++) if (text.charCodeAt(k) === 10) l++; return l; };
    const fmtV = v => String(v);
    const getTargets = t => { const o = {...DEFAULT_TARGETS}; if (t && typeof t === 'object') for (const k of Object.keys(t)) if (k in o) o[k] = t[k] === false || t[k] == null ? null : Number(t[k]); return o; };
    /** navigateurs visés qui ne gèrent pas la fonction : [{id, name, since, ok:false}] */
    const failing = (f, tg) => BROWSERS.filter(b => tg[b.id] != null && !(f.since[b.id] != null && f.since[b.id] <= tg[b.id])).map(b => ({id: b.id, name: b.name, since: f.since[b.id], ok: false}));

    /** files = {html:[{name,text}], css:[…], js:[…]} → résultats triés (le plus grave d'abord) */
    const scan = (files = {}, opts = {}) => {
        const tg = getTargets(opts.targets), out = [];
        for (const kind of ['html', 'css', 'js']) for (const file of (files[kind] || [])) {
            const text = String(file?.text ?? ''); if (!text.trim()) continue;
            const v = views(kind, text);
            for (const f of FEATURES) {
                const idx = find(f, v); if (!(idx >= 0)) continue;
                const browsers = failing(f, tg);
                out.push({id: f.id, label: f.label, type: f.type, file: String(file.name || ''), line: lineOf(text, idx), browsers, advice: f.advice, ok: !browsers.length, score: browsers.reduce((s, b) => s + BY_ID[b.id].market, 0)});
            }
        }
        return out.sort((a, b) => b.score - a.score || b.browsers.length - a.browsers.length || a.label.localeCompare(b.label, 'fr') || a.file.localeCompare(b.file) || a.line - b.line);
    };

    /** User-Agent plausible (versions récentes) */
    const ua = id => {
        const c = CURRENT, cv = `${c.chrome}.0.0.0`;
        return ({
            chrome: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cv} Safari/537.36`,
            edge: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cv} Safari/537.36 Edg/${c.edge}.0.0.0`,
            firefox: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${c.firefox}.0) Gecko/20100101 Firefox/${c.firefox}.0`,
            safari: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${c.safari} Safari/605.1.15`,
            ios: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${c.ios} Mobile/15E148 Safari/604.1`,
            samsung: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/${c.samsung}.0 Chrome/136.0.0.0 Mobile Safari/537.36`,
        })[id] || '';
    };

    /** barre de fenêtre stylisée (HTML + styles en ligne, sans image) ; opts : {url, title} */
    const chrome = (id, opts = {}) => {
        const b = BY_ID[id] || BY_ID.chrome, url = esc(opts.url || 'mon-site.fr'), title = esc(opts.title || 'Mon site');
        const bar = 'display:flex;align-items:center;gap:8px;padding:6px 10px;font:12px/1.2 system-ui,-apple-system,sans-serif;color:inherit;border:1px solid rgba(127,127,127,.35);border-bottom:0;background:rgba(127,127,127,.10);user-select:none;-webkit-user-select:none';
        const field = (bg, extra = '') => `<span style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;padding:4px 8px;background:${bg};border:1px solid rgba(127,127,127,.25);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;${extra}"><span aria-hidden="true">🔒</span><span style="overflow:hidden;text-overflow:ellipsis">${url}</span></span>`;
        const dot = c => `<span style="width:10px;height:10px;border-radius:50%;background:${c};flex:none"></span>`;
        const tab = (accent) => `<span style="flex:none;max-width:160px;padding:3px 10px;border-top:2px solid ${accent};background:rgba(127,127,127,.12);overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${title}</span>`;
        const nav = '<span aria-hidden="true" style="opacity:.6;letter-spacing:4px">‹ › ↻</span>';
        const wrap = inner => `<div class="swc-chrome" data-browser="${b.id}" role="img" aria-label="${esc(b.name)} — ${url}" style="${bar}">${inner}</div>`;
        switch (b.id) {
            case 'safari': return wrap(`${dot('#ff5f57')}${dot('#febc2e')}${dot('#28c840')}<span aria-hidden="true" style="opacity:.6;margin-left:6px">‹ ›</span>${field('rgba(127,127,127,.14)', 'justify-content:center;max-width:420px;margin:0 auto')}<span aria-hidden="true" style="opacity:.6">⇪ ＋</span>`);
            case 'ios': return wrap(`<span aria-hidden="true" style="opacity:.7">AA</span>${field('rgba(127,127,127,.16)', 'justify-content:center')}<span aria-hidden="true" style="opacity:.7">↻</span>`);
            case 'firefox': return wrap(`${tab('#ff7139')}${nav}${field('rgba(127,127,127,.06)')}<span aria-hidden="true" style="opacity:.6">☰</span>`);
            case 'edge': return wrap(`${tab('#0078d4')}${nav}${field('rgba(127,127,127,.06)', 'border-radius:0')}<span aria-hidden="true" style="opacity:.6">⋯</span>`);
            case 'samsung': return wrap(`<span aria-hidden="true" style="opacity:.7">⌂</span>${field('rgba(127,127,127,.16)')}<span aria-hidden="true" style="flex:none;border:1px solid currentColor;padding:0 4px;font-size:10px">1</span><span aria-hidden="true" style="opacity:.7">☰</span>`);
            default: return wrap(`${tab('#1a73e8')}${nav}${field('rgba(127,127,127,.06)')}<span aria-hidden="true" style="opacity:.6">⋮</span>`);
        }
    };

    const missText = browsers => browsers.map(x => x.since == null ? `pas sur ${x.name}` : `pas sur ${x.name} avant ${fmtV(x.since)}`).join(', ');
    const targetsText = tg => BROWSERS.filter(b => tg[b.id] != null).map(b => `${b.name} ${fmtV(tg[b.id])}+`).join(', ');
    /** la liste à lire, en français ; chaque ligne porte data-compat-goto="fichier:ligne" */
    const panelHtml = (results = [], opts = {}) => {
        const tg = getTargets(opts.targets), bad = results.filter(r => r.browsers.length), good = results.filter(r => !r.browsers.length);
        const row = r => `<li class="swc-item ${r.browsers.length ? 'swc-bad' : 'swc-ok'}" data-compat-goto="${esc(r.file)}:${r.line}" tabindex="0" role="button" title="Aller à la ligne ${r.line} de ${esc(r.file)}">${r.browsers.length ? '⚠️' : '✅'} <b>${esc(r.label)}</b> — ${r.browsers.length ? esc(missText(r.browsers)) : 'partout chez les navigateurs visés'} · <span class="swc-where">ligne ${r.line} de ${esc(r.file)}</span> · <span class="swc-advice">${esc(r.advice)}</span></li>`;
        const foot = `<p class="swc-targets"><small>Navigateurs visés : ${esc(targetsText(tg))}.</small></p>`;
        if (!bad.length) return `<div class="swc-panel"><p class="swc-empty">✅ Rien à signaler : ton site devrait marcher sur tous les navigateurs visés.</p>${good.length ? `<details class="swc-good"><summary>${good.length} fonction${good.length > 1 ? 's' : ''} récente${good.length > 1 ? 's' : ''}, bien prise${good.length > 1 ? 's' : ''} en charge</summary><ul class="swc-list">${good.map(row).join('')}</ul></details>` : ''}${foot}</div>`;
        return `<div class="swc-panel"><p class="swc-head"><b>${bad.length} point${bad.length > 1 ? 's' : ''} à vérifier</b> : certains visiteurs verront ton site un peu différemment.</p><ul class="swc-list">${bad.map(row).join('')}</ul>${good.length ? `<details class="swc-good"><summary>${good.length} autre${good.length > 1 ? 's' : ''} fonction${good.length > 1 ? 's' : ''} récente${good.length > 1 ? 's' : ''}, sans souci</summary><ul class="swc-list">${good.map(row).join('')}</ul></details>` : ''}${foot}</div>`;
    };

    const API = {BROWSERS: BROWSERS.map(({letter, ...b}) => b), FEATURES, DEFAULT_TARGETS, CURRENT, scan, ua, chrome, panelHtml, _views: views};
    if (root) { const ext = root.LCNDA_EXT = root.LCNDA_EXT || {}; ext.siteCompat = API; }
    if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : null);
