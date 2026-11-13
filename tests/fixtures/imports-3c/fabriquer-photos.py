#!/usr/bin/env python3
"""Fabrique les photos d'essai de tests/test-imports-exports-3c.js (données inventées, aucune vraie photo de famille).
   python3 -I tests/fixtures/imports-3c/fabriquer-photos.py tests/fixtures/imports-3c
   - google-takeout.zip : export Google Photos (Takeout) avec les .json à côté de chaque photo, un album, une vidéo, un HEIC ;
   - apple-photos/ : photos exportées par Apple Photos (XMP et IPTC dans le JPEG, ou .xmp à côté) ;
   - piège-chemin.zip (« ../ »), piège-bombe.zip (bombe zip), abime.zip (coupé), sans-meta.jpg."""
import io, json, os, struct, sys, zipfile
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

def jpeg(color, exif=None):
    im = Image.new('RGB', (64, 48), color)
    b = io.BytesIO()
    if exif is not None: im.save(b, 'JPEG', quality=70, exif=exif)
    else: im.save(b, 'JPEG', quality=70)
    return b.getvalue()

def with_exif(color, date=None, gps=None, desc=None):
    ex = Image.Exif()
    if desc: ex[0x010e] = desc
    if date:
        ex[0x0132] = date
        ex.get_ifd(0x8769)[0x9003] = date
    if gps:
        lat, lon = gps
        def dms(v):
            v = abs(v); d = int(v); m = int((v - d) * 60); s = round(((v - d) * 60 - m) * 60 * 100)
            from PIL.TiffImagePlugin import IFDRational
            return (IFDRational(d, 1), IFDRational(m, 1), IFDRational(s, 100))
        g = ex.get_ifd(0x8825)
        g[1] = 'N' if lat >= 0 else 'S'; g[2] = dms(lat); g[3] = 'E' if lon >= 0 else 'W'; g[4] = dms(lon)
    return jpeg(color, ex)

def insert_segment(data, marker, payload):
    seg = bytes([0xff, marker]) + struct.pack('>H', len(payload) + 2) + payload
    return data[:2] + seg + data[2:]

def xmp_packet(body):
    return ('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            + body + '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>')

def iptc(records):
    iim = b'\x1c\x01\x5a\x00\x03\x1b\x25\x47'  # 1:90 = UTF-8
    for ds, val in records:
        v = val.encode('utf-8'); iim += bytes([0x1c, 2, ds]) + struct.pack('>H', len(v)) + v
    res = b'8BIM' + struct.pack('>H', 0x0404) + b'\x00\x00' + struct.pack('>I', len(iim)) + iim + (b'\x00' if len(iim) % 2 else b'')
    return b'Photoshop 3.0\x00' + res

def zinfo(name):
    zi = zipfile.ZipInfo(name, date_time=(2026, 10, 1, 12, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED; return zi

# ─── Google Photos (Takeout) ───
def takeout_json(title, ts, lat=0.0, lon=0.0, desc='', people=(), exif_geo=None):
    j = {'title': title, 'description': desc, 'imageViews': '4',
         'creationTime': {'timestamp': str(ts + 86400), 'formatted': ''},
         'photoTakenTime': {'timestamp': str(ts), 'formatted': ''},
         'geoData': {'latitude': lat, 'longitude': lon, 'altitude': 0.0, 'latitudeSpan': 0.0, 'longitudeSpan': 0.0},
         'url': 'https://photos.google.com/photo/AF1QipExempleInvente'}
    if exif_geo: j['geoDataExif'] = {'latitude': exif_geo[0], 'longitude': exif_geo[1], 'altitude': 0.0, 'latitudeSpan': 0.0, 'longitudeSpan': 0.0}
    if people: j['people'] = [{'name': p} for p in people]
    return json.dumps(j, ensure_ascii=False, indent=2)

T = 'Takeout/Google Photos/'
with zipfile.ZipFile(os.path.join(out, 'google-takeout.zip'), 'w') as z:
    z.writestr(zinfo(T + 'Pique-nique à Tulle/metadata.json'), json.dumps({'title': 'Pique-nique à Tulle', 'description': '', 'access': 'protected', 'date': {'timestamp': '1563092525'}}, ensure_ascii=False))
    # 1. photo + .supplemental-metadata.json (nouveau nom), lieu et personnes nommées
    z.writestr(zinfo(T + 'Pique-nique à Tulle/IMG_20190714_102205.jpg'), jpeg((200, 120, 80)))
    z.writestr(zinfo(T + 'Pique-nique à Tulle/IMG_20190714_102205.jpg.supplemental-metadata.json'),
               takeout_json('IMG_20190714_102205.jpg', 1563092525, 45.2671, 1.7706, 'Pique-nique au bord de la Corrèze', ['Mamie Jeanne', 'Hélène Dubœuf']))
    # 2. doublon « (1) » : son .json s'appelle « IMG_20190714_102205.jpg(1).json » (ancien nom)
    z.writestr(zinfo(T + 'Pique-nique à Tulle/IMG_20190714_102205(1).jpg'), jpeg((190, 110, 70)))
    z.writestr(zinfo(T + 'Pique-nique à Tulle/IMG_20190714_102205.jpg(1).json'), takeout_json('IMG_20190714_102205(1).jpg', 1563092590, 45.2671, 1.7706, 'Le même, une minute après'))
    # 3. retouchée « -modifié » : reprend le .json de l'original
    z.writestr(zinfo(T + 'Pique-nique à Tulle/IMG_20190714_102205-modifié.jpg'), jpeg((210, 130, 90)))
    # 4. nom très long : le .json est coupé (51 lettres en tout)
    long_name = 'Scan_album_famille_Faure_mariage_Leon_et_Helene_1931.jpg'
    jname = (long_name + '.supplemental-metadata')[:46] + '.json'
    z.writestr(zinfo(T + 'Photos from 1931/' + long_name), jpeg((120, 120, 120)))
    z.writestr(zinfo(T + 'Photos from 1931/' + jname), takeout_json(long_name, -1214870400, 0.0, 0.0,
               'Mariage de Léon et Hélène, devant la mairie', ['Léon Faure', 'Hélène Cabanis'], exif_geo=(45.2655, 1.7712)))
    # 5. photo dont le fichier a sa date et son GPS (EXIF) : ils passent avant le .json
    z.writestr(zinfo(T + 'Photos from 2020/PXL_20200815_143000.jpg'), with_exif((90, 140, 200), '2020:08:15 16:30:00', (48.8584, 2.2945)))
    z.writestr(zinfo(T + 'Photos from 2020/PXL_20200815_143000.jpg.json'), takeout_json('PXL_20200815_143000.jpg', 1597501800, 0.0, 0.0, 'Tour Eiffel'))
    # 6. une vidéo, un HEIC (laissé de côté), un fichier sans rien
    z.writestr(zinfo(T + 'Photos from 2020/VID_20200815_150000.mp4'), b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom' + b'\x00' * 64)
    z.writestr(zinfo(T + 'Photos from 2020/VID_20200815_150000.mp4.json'), takeout_json('VID_20200815_150000.mp4', 1597503600, 48.8606, 2.3376, 'Au Louvre'))
    z.writestr(zinfo(T + 'Photos from 2020/IMG_0001.HEIC'), b'\x00\x00\x00\x18ftypheic' + b'\x00' * 32)
    z.writestr(zinfo(T + 'Photos from 2020/IMG_0001.HEIC.json'), takeout_json('IMG_0001.HEIC', 1597503000))
    z.writestr(zinfo(T + 'print-subscriptions.json'), '{}')
    z.writestr(zinfo('Takeout/archive_browser.html'), '<html><body>Archive</body></html>')

# ─── Apple Photos ───
ap = os.path.join(out, 'apple-photos'); os.makedirs(ap, exist_ok=True)
x1 = xmp_packet('<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" '
    'xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" '
    'photoshop:City="Égletons" photoshop:State="Corrèze" photoshop:Country="France" photoshop:DateCreated="1958-06-21T15:00:00" '
    'exif:GPSLatitude="45,24.3N" exif:GPSLongitude="2,2.88E">'
    '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Communion de Zoé</rdf:li></rdf:Alt></dc:title>'
    '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">Devant l’église, après la messe &amp; le repas</rdf:li></rdf:Alt></dc:description>'
    '<dc:subject><rdf:Bag><rdf:li>communion</rdf:li><rdf:li>famille Faure</rdf:li><rdf:li>Égletons</rdf:li></rdf:Bag></dc:subject>'
    '<Iptc4xmpExt:PersonInImage><rdf:Bag><rdf:li>Odile Œuvrard</rdf:li><rdf:li>Aimé Faure</rdf:li></rdf:Bag></Iptc4xmpExt:PersonInImage>'
    '</rdf:Description>')
img = jpeg((230, 220, 200))
img = insert_segment(img, 0xed, iptc([(5, 'Communion (IPTC)'), (25, 'communion'), (25, 'souvenir'), (120, 'Légende IPTC'), (90, 'Égletons'), (101, 'France')]))
img = insert_segment(img, 0xe1, b'http://ns.adobe.com/xap/1.0/\x00' + x1.encode('utf-8'))
open(os.path.join(ap, 'IMG_0042.jpg'), 'wb').write(img)
# IPTC seulement (Apple « Titre, mots-clés et légende »), et EXIF
img2 = with_exif((150, 170, 150), '1972:12:25 11:05:00', None, 'OLYMPUS DIGITAL CAMERA')
img2 = insert_segment(img2, 0xed, iptc([(5, 'Noël 1972'), (120, 'Noël chez les Faure'), (25, 'Noël'), (25, 'famille Faure'), (90, 'Tulle'), (95, 'Corrèze'), (101, 'France')]))
open(os.path.join(ap, 'IMG_0043.jpg'), 'wb').write(img2)
# .xmp à côté (réglage « Exporter IPTC en XMP »), régions de visages (MWG)
open(os.path.join(ap, 'IMG_0044.jpg'), 'wb').write(jpeg((100, 100, 160)))
open(os.path.join(ap, 'IMG_0044.xmp'), 'w', encoding='utf-8').write(xmp_packet(
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:exif="http://ns.adobe.com/exif/1.0/" '
    'xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/" xmlns:stArea="http://ns.adobe.com/xmp/sType/Area#" exif:DateTimeOriginal="1985-08-03T09:30:00">'
    '<dc:subject><rdf:Bag><rdf:li>plage</rdf:li><rdf:li>vacances</rdf:li></rdf:Bag></dc:subject>'
    '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">À la plage de Biarritz</rdf:li></rdf:Alt></dc:description>'
    '<mwg-rs:Regions rdf:parseType="Resource"><mwg-rs:RegionList><rdf:Bag>'
    '<rdf:li rdf:parseType="Resource"><mwg-rs:Name>Chloé Faure</mwg-rs:Name><mwg-rs:Type>Face</mwg-rs:Type></rdf:li>'
    '</rdf:Bag></mwg-rs:RegionList></mwg-rs:Regions>'
    '<exif:GPSLatitude>43,28.92N</exif:GPSLatitude><exif:GPSLongitude>1,33.54W</exif:GPSLongitude></rdf:Description>'))
# XMP piégé : une entité (refusée par le lecteur XML de l'app)
open(os.path.join(ap, 'IMG_0045.jpg'), 'wb').write(jpeg((10, 10, 10)))
open(os.path.join(ap, 'IMG_0045.xmp'), 'w', encoding='utf-8').write('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:description="&b;"/></rdf:RDF></x:xmpmeta>')

# ─── pièges ───
with zipfile.ZipFile(os.path.join(out, 'piege-chemin.zip'), 'w') as z:
    z.writestr(zinfo('Takeout/Google Photos/ok.jpg'), jpeg((1, 2, 3)))
    z.writestr(zinfo('../../evil.jpg'), jpeg((4, 5, 6)))
with zipfile.ZipFile(os.path.join(out, 'piege-bombe.zip'), 'w') as z:
    z.writestr(zinfo('Takeout/Google Photos/bombe.jpg.json'), b'{"title": "' + b'a' * (40 * 1024 * 1024) + b'"}')
    z.writestr(zinfo('Takeout/Google Photos/bombe.jpg'), jpeg((7, 8, 9)))
good = open(os.path.join(out, 'google-takeout.zip'), 'rb').read()
open(os.path.join(out, 'abime.zip'), 'wb').write(good[: len(good) // 3])
print('fait :', out)
