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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--language", default="")
    parser.add_argument("--engine", default="kraken")
    parser.add_argument("--segment-direction", default="horizontal-lr")
    parser.add_argument("--base-dir", default="auto")
    args = parser.parse_args()

    image = Path(args.image)
    model = Path(args.model)
    if not image.is_file():
        return respond({"error": "Image introuvable."}, 2)
    if not model.is_file():
        return respond({"error": "Modèle HTR introuvable."}, 2)
    if args.engine != "kraken":
        return respond({"error": f"Moteur HTR non supporté : {args.engine}."}, 2)

    result = run_kraken(image, model, args.segment_direction, args.base_dir)
    if result.get("error"):
        return respond(result, 1)
    result["language"] = args.language
    return respond(result)


if __name__ == "__main__":
    raise SystemExit(main())
