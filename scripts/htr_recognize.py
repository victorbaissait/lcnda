#!/usr/bin/env python3
"""Local handwritten text recognition bridge for the genealogy app.

This script is intentionally small: PHP validates paths and model choices,
then this bridge runs Kraken and returns JSON for the browser.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def respond(payload: dict, status: int = 0) -> int:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    return status


def model_path_for_kraken(model: Path, tmpdir: Path) -> Path:
    """Kraken 5 et 6 découpent la valeur de « -m » comme une ligne de commande (« tag:modèle ») :
    un espace dans le chemin (« Application Support » sur Mac) ou un « : » (C:\\ sous Windows)
    donnait « Mappings must be in format tag:model ». On lui passe un nom simple, relatif au dossier
    temporaire dans lequel Kraken est lancé."""
    if re.match(r"^[\w/.+\-()=^&;,]+$", str(model)):
        return model
    target = tmpdir / ("model" + model.suffix)
    try:
        os.symlink(model, target)
    except OSError:
        shutil.copyfile(model, target)
    return Path(target.name)


def run_kraken(image: Path, model: Path, segment_direction: str = "horizontal-lr", base_dir: str = "auto") -> dict:
    venv_kraken = Path(sys.prefix) / "bin" / "kraken"
    executable_kraken = Path(sys.executable).parent / "kraken"
    windows_kraken = Path(sys.executable).parent / "kraken.exe"  # Windows : venv\Scripts\kraken.exe
    if venv_kraken.is_file():
        kraken = str(venv_kraken)
    elif executable_kraken.is_file():
        kraken = str(executable_kraken)
    elif windows_kraken.is_file():
        kraken = str(windows_kraken)
    else:
        kraken = shutil.which("kraken")
    if not kraken:
        return {
            "error": "Kraken n'est pas installé ou n'est pas dans le PATH de PHP. Installe-le avec `python3 -m pip install kraken`."
        }

    def recognize(cmd: list[str], output: Path) -> tuple[int, str, str, str]:
        proc = subprocess.run(cmd, text=True, capture_output=True, check=False, cwd=str(output.parent))
        if proc.returncode != 0:
            details = (proc.stderr or proc.stdout or "").strip()
            return proc.returncode, "", details, "error"
        if not output.exists():
            return proc.returncode, "", "Kraken a terminé sans produire de transcription.", "missing"
        text = output.read_text(encoding="utf-8", errors="replace").strip()
        return proc.returncode, text, (proc.stderr or proc.stdout or "").strip(), "ok"

    with tempfile.TemporaryDirectory(prefix="genealogy-htr-") as tmpdir:
        output = Path(tmpdir) / "recognized.txt"
        model = model_path_for_kraken(model, Path(tmpdir))
        segmented_cmd = [
            kraken,
            "-i",
            str(image),
            str(output),
            "binarize",
            "segment",
            "-d",
            segment_direction,
            "ocr",
            "-m",
            str(model),
        ]
        if base_dir in {"L", "R", "auto"}:
            segmented_cmd.extend(["--base-dir", base_dir])
        code, text, details, status = recognize(segmented_cmd, output)
        if code != 0:
            return {"error": "Kraken n'a pas réussi à lire l'image." + (f" Détail : {details}" if details else "")}
        if text:
            return {"text": text, "engine": "kraken", "mode": "segmented"}

        fallback_output = Path(tmpdir) / "recognized-line.txt"
        line_cmd = [
            kraken,
            "-i",
            str(image),
            str(fallback_output),
            "binarize",
            "ocr",
            "--no-segmentation",
            "-m",
            str(model),
        ]
        if base_dir in {"L", "R", "auto"}:
            line_cmd.extend(["--base-dir", base_dir])
        code, text, details, status = recognize(line_cmd, fallback_output)
        if code != 0:
            return {"error": "Kraken a segmenté l'image sans texte, puis le fallback ligne a échoué." + (f" Détail : {details}" if details else "")}
        return {"text": text, "engine": "kraken", "mode": "single-line-fallback"}


def _bbox_of(points) -> list | None:
    try:
        xs = [float(p[0]) for p in points]
        ys = [float(p[1]) for p in points]
    except (TypeError, ValueError, IndexError):
        return None
    if not xs:
        return None
    return [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))]


def words_from_chars(text: str, confs: list, cuts: list) -> list[dict]:
    """Découpe une ligne reconnue en mots, avec la confiance du mot (la plus basse de ses lettres) et sa boîte."""
    words: list[dict] = []
    cur, cc, cb = "", [], []
    for i, ch in enumerate(text):
        if ch.isspace():
            if cur:
                words.append({"t": cur, "c": round(min(cc), 3) if cc else None, "bbox": _bbox_of([p for poly in cb for p in poly]) if cb else None})
            cur, cc, cb = "", [], []
            continue
        cur += ch
        if i < len(confs):
            try:
                cc.append(float(confs[i]))
            except (TypeError, ValueError):
                pass
        if i < len(cuts):
            c = cuts[i]
            if isinstance(c, (list, tuple)) and c and isinstance(c[0], (list, tuple)):
                cb.append(c)
    if cur:
        words.append({"t": cur, "c": round(min(cc), 3) if cc else None, "bbox": _bbox_of([p for poly in cb for p in poly]) if cb else None})
    return words


def parse_alto(xml_text: str) -> list[dict]:
    """Lignes d'un fichier ALTO écrit par Kraken (-a) : texte, boîte, confiance des mots (WC)."""
    import xml.etree.ElementTree as ET
    if "<!DOCTYPE" in xml_text or "<!ENTITY" in xml_text:
        raise ValueError("ALTO refusé (DOCTYPE)")
    root = ET.fromstring(xml_text)
    out = []
    for el in root.iter():
        if not el.tag.endswith("TextLine"):
            continue
        words = []
        for w in el.iter():
            if not w.tag.endswith("String"):
                continue
            try:
                x, y, ww, hh = (float(w.get(k, "0")) for k in ("HPOS", "VPOS", "WIDTH", "HEIGHT"))
                box = [round(x), round(y), round(x + ww), round(y + hh)]
            except ValueError:
                box = None
            wc = w.get("WC")
            words.append({"t": w.get("CONTENT", ""), "c": round(float(wc), 3) if wc not in (None, "") else None, "bbox": box})
        try:
            x, y, ww, hh = (float(el.get(k, "0")) for k in ("HPOS", "VPOS", "WIDTH", "HEIGHT"))
            box = [round(x), round(y), round(x + ww), round(y + hh)]
        except ValueError:
            box = None
        text = " ".join(w["t"] for w in words if w["t"])
        confs = [w["c"] for w in words if w["c"] is not None]
        if text.strip():
            out.append({"text": text, "bbox": box, "conf": round(sum(confs) / len(confs), 3) if confs else None, "words": words})
    return out


# ─── Mentions écrites à 90° dans la marge (verticales) ─────────────────────────────────────────────────────────────
# La segmentation des lignes (blla) est faite pour l'écriture horizontale : une mention écrite de bas en haut dans la
# marge revient en petits bouts de « lignes » (« 2 », « 1 », « 6 », « Buraez »…) mêlés au texte. On repère ces zones
# (une ligne nettement plus haute que large, une ligne de base verticale, ou une pile de petits bouts dans une même
# colonne), on tourne leur morceau d'image de +90° et de −90°, on relit chaque sens et on garde la lecture la plus
# sûre — seulement si elle est plus sûre que les bouts lus de travers. Les lignes horizontales ne changent pas.

def _wh(b) -> tuple[float, float]:
    return max(1.0, float(b[2]) - float(b[0])), max(1.0, float(b[3]) - float(b[1]))


def _median(v: list[float], default: float = 0.0) -> float:
    v = sorted(v)
    if not v:
        return default
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def _baseline_vertical(bl) -> bool:
    try:
        (x0, y0), (x1, y1) = (float(bl[0][0]), float(bl[0][1])), (float(bl[-1][0]), float(bl[-1][1]))
    except (TypeError, ValueError, IndexError):
        return False
    return abs(y1 - y0) > 2 * abs(x1 - x0) and abs(y1 - y0) > 0


def vertical_zones(lines: list[dict]) -> list[dict]:
    """Les zones écrites verticalement : [{"idx": [n° des lignes], "bbox": [x0, y0, x1, y1]}].
    Chaque ligne : {"bbox": [x0, y0, x1, y1], "baseline": [[x, y], …] (facultatif), "text": …}."""
    boxes = [(i, l["bbox"]) for i, l in enumerate(lines) if isinstance(l.get("bbox"), (list, tuple)) and len(l["bbox"]) == 4]
    if not boxes:
        return []
    horiz = [_wh(b) for _, b in boxes if _wh(b)[0] >= _wh(b)[1]]
    med_h = _median([h for _, h in horiz], _median([min(_wh(b)) for _, b in boxes], 20.0))
    widths = sorted((w for w, _ in horiz), reverse=True)
    ref_w = _median(widths[: max(1, len(widths) // 2)], max(_wh(b)[0] for _, b in boxes))
    # 1. une ligne verticale : ligne de base verticale, ou boîte bien plus haute que large (et plus haute que 3 lignes)
    tall = {i for i, b in boxes if _baseline_vertical(lines[i].get("baseline")) or (_wh(b)[1] >= 2.5 * _wh(b)[0] and _wh(b)[1] >= 3 * med_h)}
    # 2. les petits bouts étroits (la mention lue de travers, morceau par morceau), rassemblés avec les lignes verticales
    #    de la même colonne : une seule zone par colonne, lue d'un coup
    cand = [(i, b) for i, b in boxes if i in tall or _wh(b)[0] < 0.35 * ref_w]
    parent = {i: i for i, _ in cand}

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for k, (i, a) in enumerate(cand):
        for j, c in cand[k + 1:]:
            ov = min(a[2], c[2]) - max(a[0], c[0])
            gap = max(a[1], c[1]) - min(a[3], c[3])
            if ov >= 0.3 * min(_wh(a)[0], _wh(c)[0]) and gap <= 1.5 * max(med_h, min(_wh(a)[1], _wh(c)[1])):
                parent[find(i)] = find(j)
    groups: dict[int, list[int]] = {}
    for i, _ in cand:
        groups.setdefault(find(i), []).append(i)
    zones: list[dict] = []
    for idx in groups.values():
        bb = [min(lines[i]["bbox"][0] for i in idx), min(lines[i]["bbox"][1] for i in idx), max(lines[i]["bbox"][2] for i in idx), max(lines[i]["bbox"][3] for i in idx)]
        w, h = _wh(bb)
        if any(i in tall for i in idx) or (len(idx) >= 2 and h >= 2 * w and h >= 2.5 * med_h):
            zones.append({"idx": sorted(idx, key=lambda n: lines[n]["bbox"][1]), "bbox": [round(v) for v in bb]})
    return zones


def _rot_point_back(x: float, y: float, angle: int, cw: float, ch: float) -> tuple[float, float]:
    """Un point du morceau tourné (PIL rotate(angle, expand=True)) → le point du morceau d'origine (largeur cw, hauteur ch)."""
    if angle == 90:   # sens inverse des aiguilles : (x, y) → (y, cw − x)
        return cw - y, x
    return y, ch - x  # −90, sens des aiguilles : (x, y) → (ch − y, x)


def _box_back(b, angle: int, cw: float, ch: float, ox: float, oy: float):
    if not isinstance(b, (list, tuple)) or len(b) != 4:
        return None
    pts = [_rot_point_back(x, y, angle, cw, ch) for x, y in ((b[0], b[1]), (b[2], b[1]), (b[0], b[3]), (b[2], b[3]))]
    return [round(min(p[0] for p in pts) + ox), round(min(p[1] for p in pts) + oy), round(max(p[0] for p in pts) + ox), round(max(p[1] for p in pts) + oy)]


def _mean_conf(lines: list[dict]) -> float:
    cs = [float(l["conf"]) for l in lines if isinstance(l.get("conf"), (int, float))]
    return sum(cs) / len(cs) if cs else 0.0


def split_margin(im, lines: list[dict], read_fn) -> tuple[list[dict], list[dict]]:
    """(lignes du texte, lignes de la mention en marge). read_fn(image PIL) → lignes lues dans ce morceau (même forme que
    les lignes de la page, boîtes dans le morceau). Les lignes de la page gardent leur ordre ; rien ne change sans zone verticale."""
    zones = vertical_zones(lines)
    if not zones:
        return lines, []
    W, H = im.size
    drop: set[int] = set()
    margin: list[dict] = []
    for z in sorted(zones, key=lambda z: (z["bbox"][0], z["bbox"][1])):
        x0, y0, x1, y1 = z["bbox"]
        px, py = max(6, round(0.3 * (x1 - x0))), max(10, round(0.6 * (x1 - x0)))  # un peu de marge : les bouts lus de travers ne couvrent pas toujours toute la mention
        cx0, cy0, cx1, cy1 = max(0, x0 - px), max(0, y0 - py), min(W, x1 + px), min(H, y1 + py)
        if cx1 - cx0 < 2 or cy1 - cy0 < 2:
            continue
        crop = im.crop((cx0, cy0, cx1, cy1))
        cw, ch = crop.size
        best = None
        for angle in (90, -90):  # les deux sens : de bas en haut, de haut en bas
            try:
                got = [l for l in (read_fn(crop.rotate(angle, expand=True)) or []) if str(l.get("text", "")).strip()]
            except Exception:  # pragma: no cover - une lecture qui échoue : l'autre sens, ou rien
                got = []
            if got and (best is None or _mean_conf(got) > best[0]):
                best = (_mean_conf(got), angle, got)
        before = _mean_conf([lines[i] for i in z["idx"]])
        if not best or best[0] < 0.5 or best[0] <= before + 0.03:
            continue  # la lecture tournée n'est pas plus sûre : on laisse les lignes comme elles sont
        conf, angle, got = best
        got.sort(key=lambda l: (l.get("bbox") or [0, 0])[1])
        for l in got:
            margin.append({"text": l["text"], "bbox": _box_back(l.get("bbox"), angle, cw, ch, cx0, cy0) or [x0, y0, x1, y1], "conf": l.get("conf"),
                           "words": [{**w, "bbox": _box_back(w.get("bbox"), angle, cw, ch, cx0, cy0)} for w in (l.get("words") or [])], "rotated": angle})
        drop.update(z["idx"])
    return [l for i, l in enumerate(lines) if i not in drop], margin


def _kraken_read_lines(net, im) -> list[dict]:
    from kraken import blla, rpred  # type: ignore
    seg = blla.segment(im)
    out = []
    for rec in rpred.rpred(net, im, seg):
        text = str(getattr(rec, "prediction", "") or "")
        if not text.strip():
            continue
        confs = list(getattr(rec, "confidences", []) or [])
        cuts = list(getattr(rec, "cuts", []) or [])
        poly = getattr(rec, "boundary", None) or getattr(rec, "line", None) or []
        out.append({"text": text, "bbox": _bbox_of(poly), "baseline": [list(map(float, p)) for p in (getattr(rec, "baseline", None) or [])],
                    "conf": round(sum(map(float, confs)) / len(confs), 3) if confs else None, "words": words_from_chars(text, confs, cuts)})
    return out


def run_kraken_lines(image: Path, model: Path) -> dict:
    """Ligne par ligne, avec la confiance de chaque mot : d'abord par la bibliothèque Kraken (segmentation des lignes
    de base, puis lecture), sinon par la commande « kraken … -a » (ALTO). Rien ne part sur Internet."""
    try:
        from PIL import Image  # type: ignore
        from kraken import blla, rpred  # type: ignore
        from kraken.lib import models  # type: ignore
        assert blla and rpred  # la bibliothèque est là (sinon : la commande, plus bas)
        im = Image.open(str(image))
        im.load()
        net = models.load_any(str(model))
        lines = _kraken_read_lines(net, im)
        margin: list[dict] = []
        try:  # 📐 mentions verticales dans la marge : lues à part, après rotation (rien ne change sans elles)
            lines, margin = split_margin(im, lines, lambda crop: _kraken_read_lines(net, crop))
        except Exception:  # pragma: no cover - la lecture de la page reste, telle quelle
            margin = []
        for l in lines + margin:
            l.pop("baseline", None)
        return {"lines": lines, "margin_lines": margin, "text": "\n".join(l["text"] for l in lines), "engine": "kraken", "mode": "lines"}
    except Exception as exc:  # pragma: no cover - dépend de la version de Kraken
        api_error = str(exc)
    kraken = shutil.which("kraken", path=os.pathsep.join([str(Path(sys.executable).parent), os.environ.get("PATH", "")]))
    if not kraken:
        return {"error": "Kraken n'est pas installé : Réglages → Reconnaissance d'écriture (HTR)."}
    with tempfile.TemporaryDirectory(prefix="genealogy-htr-") as tmpdir:
        out = Path(tmpdir) / "page.xml"
        m = model_path_for_kraken(model, Path(tmpdir))
        proc = subprocess.run([kraken, "-a", "-i", str(image), str(out), "segment", "-bl", "ocr", "-m", str(m)], text=True, capture_output=True, check=False, cwd=tmpdir)
        if proc.returncode == 0 and out.exists():
            lines = parse_alto(out.read_text(encoding="utf-8", errors="replace"))
            return {"lines": lines, "text": "\n".join(l["text"] for l in lines), "engine": "kraken", "mode": "alto"}
    plain = run_kraken(image, model)
    if plain.get("error"):
        plain["error"] += f" ({api_error[:200]})"
        return plain
    lines = [{"text": t, "bbox": None, "conf": None, "words": [{"t": w, "c": None, "bbox": None} for w in t.split()]} for t in str(plain.get("text", "")).splitlines() if t.strip()]
    return {"lines": lines, "text": plain.get("text", ""), "engine": "kraken", "mode": "plain"}


def check(model: Path | None) -> dict:
    try:
        import importlib.metadata as md
        version = md.version("kraken")
    except Exception as exc:
        return {"ok": False, "error": f"Kraken ne s'ouvre pas : {exc}"}
    try:
        from kraken.lib import models  # type: ignore
        if model is not None:
            models.load_any(str(model))
    except Exception as exc:
        return {"ok": False, "error": f"Le modèle ne s'ouvre pas : {str(exc)[:300]}"}
    return {"ok": True, "kraken": version, "python": "%d.%d.%d" % sys.version_info[:3]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", default="")
    parser.add_argument("--model", default="")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--lines", action="store_true")
    parser.add_argument("--language", default="")
    parser.add_argument("--engine", default="kraken")
    parser.add_argument("--segment-direction", default="horizontal-lr")
    parser.add_argument("--base-dir", default="auto")
    args = parser.parse_args()

    if args.check:
        res = check(Path(args.model) if args.model else None)
        return respond(res, 0 if res.get("ok") else 1)
    if not args.image or not args.model:
        return respond({"error": "Image ou modèle manquant."}, 2)
    image = Path(args.image)
    model = Path(args.model)
    if not image.is_file():
        return respond({"error": "Image introuvable."}, 2)
    if not model.is_file():
        return respond({"error": "Modèle HTR introuvable."}, 2)
    if args.engine != "kraken":
        return respond({"error": f"Moteur HTR non supporté : {args.engine}."}, 2)

    result = run_kraken_lines(image, model) if args.lines else run_kraken(image, model, args.segment_direction, args.base_dir)
    if result.get("error"):
        return respond(result, 1)
    result["language"] = args.language
    return respond(result)


if __name__ == "__main__":
    raise SystemExit(main())
