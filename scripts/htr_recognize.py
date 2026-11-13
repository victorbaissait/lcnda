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


def run_kraken_lines(image: Path, model: Path) -> dict:
    """Ligne par ligne, avec la confiance de chaque mot : d'abord par la bibliothèque Kraken (segmentation des lignes
    de base, puis lecture), sinon par la commande « kraken … -a » (ALTO). Rien ne part sur Internet."""
    try:
        from PIL import Image  # type: ignore
        from kraken import blla, rpred  # type: ignore
        from kraken.lib import models  # type: ignore
        im = Image.open(str(image))
        seg = blla.segment(im)
        net = models.load_any(str(model))
        lines = []
        for rec in rpred.rpred(net, im, seg):
            text = str(getattr(rec, "prediction", "") or "")
            if not text.strip():
                continue
            confs = list(getattr(rec, "confidences", []) or [])
            cuts = list(getattr(rec, "cuts", []) or [])
            poly = getattr(rec, "boundary", None) or getattr(rec, "line", None) or []
            words = words_from_chars(text, confs, cuts)
            lines.append({"text": text, "bbox": _bbox_of(poly), "conf": round(sum(map(float, confs)) / len(confs), 3) if confs else None, "words": words})
        return {"lines": lines, "text": "\n".join(l["text"] for l in lines), "engine": "kraken", "mode": "lines"}
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
