from fetch import get_json
import urllib.parse as u
def sparql(q):
    return get_json('https://query.wikidata.org/sparql?format=json&query=' + u.quote(q), pause=2, headers={'Accept': 'application/sparql-results+json'})['results']['bindings']
