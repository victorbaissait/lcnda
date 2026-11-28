"""Le texte lisible d'une page Wikipédia rendue (action=render) : paragraphes et titres, sans balises ni appels de note.
Sert à vérifier que chaque phrase citée est mot pour mot dans la page."""
import html as H, re, sys


def text_of(html):
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', html)
    s = re.sub(r'(?is)<sup[^>]*class="[^"]*reference[^"]*"[^>]*>.*?</sup>', '', s)  # [1], [2]…
    s = re.sub(r'(?is)<span[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>.*?</span>\s*</span>', '', s)
    s = re.sub(r'(?i)<h([1-6])[^>]*>', lambda m: '\n\n' + '#' * int(m.group(1)) + ' ', s)
    s = re.sub(r'(?i)</(p|li|h[1-6]|tr|div|dd|dt|blockquote)>', '\n', s)
    s = re.sub(r'(?i)<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = H.unescape(s).replace('\xa0', ' ').replace(' ', ' ')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n\n', s)
    return s.strip()


def norm(s):
    """forme de comparaison : espaces uniques, apostrophes et guillemets unifiés"""
    s = s.replace('’', "'").replace('‘', "'").replace('«', '"').replace('»', '"').replace('“', '"').replace('”', '"')
    s = s.replace('\xa0', ' ').replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip()


if __name__ == '__main__':
    print(text_of(open(sys.argv[1], encoding='utf-8').read()))
