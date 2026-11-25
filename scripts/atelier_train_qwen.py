#!/usr/bin/env python3
"""
🎓 Entraîner Qwen (vision) sur mes lignes relues, avec Unsloth (LoRA) — lancé par scripts/atelier_train.php.

  python atelier_train_qwen.py --engine qwen --base unsloth/Qwen2.5-VL-3B-Instruct-bnb-4bit \
      --train train.txt --val val.txt --heldout heldout.txt --out OUT --epochs 30

Chaque fichier .txt liste des images de lignes (PNG) ; le texte juste de chacune est à côté (même nom, .gt.txt).
Écrit des lignes JSON sur la sortie (lues par l'app) :
  {"phase": "download"}                       le modèle de départ se télécharge (seulement si la personne l'a permis)
  {"phase": "before", "accuracy": 71.5}       justesse sur les lignes mises de côté, avant
  {"epoch": 3, "epochs": 30, "loss": 0.42}    avancée
  {"adapter": "OUT/adapter"}                  l'adaptateur LoRA (utilisable avec Unsloth)
  {"phase": "after", "accuracy": 88.0}        justesse après
  {"modelfile": "OUT/Modelfile"}              un modèle GGUF + Modelfile pour Ollama (si cette version d'Unsloth sait l'exporter)
  {"error": "…"}                              ce qui n'a pas marché, en clair
Rien ne part sur Internet : HF_HUB_OFFLINE=1 sauf si LCNDA_ALLOW_DOWNLOAD=1 (case cochée par la personne).
Sur Mac (pas de CUDA) : Unsloth n'est pas garanti ; l'app le dit avant de lancer.
"""
import argparse
import json
import os
import sys
from pathlib import Path

PROMPT = "Transcris exactement cette ligne manuscrite d'un registre ancien, lettre pour lettre, sans rien corriger ni développer."


def say(**kw):
    print(json.dumps(kw, ensure_ascii=False), flush=True)


def load_list(path):
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        img = Path(line.strip())
        gt = img.with_suffix("").with_suffix(".gt.txt") if img.suffix else None
        if line.strip() and img.is_file() and gt and gt.is_file():
            out.append((str(img), gt.read_text(encoding="utf-8").strip()))
    return out


def cer_accuracy(pairs):
    """justesse en % : 100 × (1 − distance d'édition / longueur), comme « Average accuracy » de ketos test"""
    def lev(a, b):
        prev = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            cur = [i]
            for j, cb in enumerate(b, 1):
                cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
            prev = cur
        return prev[-1]
    total = sum(len(t) for _, t in pairs) or 1
    errs = sum(lev(p, t) for p, t in pairs)
    return round(max(0.0, 100.0 * (1 - errs / total)), 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="qwen")
    ap.add_argument("--base", required=True)
    ap.add_argument("--train", required=True)
    ap.add_argument("--val", required=True)
    ap.add_argument("--heldout", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=30)
    a = ap.parse_args()
    if os.environ.get("LCNDA_ALLOW_DOWNLOAD") != "1":
        os.environ["HF_HUB_OFFLINE"] = "1"
    else:
        say(phase="download")
    try:
        from unsloth import FastVisionModel  # type: ignore
        from unsloth.trainer import UnslothVisionDataCollator  # type: ignore
        from trl import SFTTrainer, SFTConfig  # type: ignore
        from transformers import TrainerCallback  # type: ignore
        from PIL import Image  # type: ignore
        import torch  # type: ignore
    except Exception as e:  # pragma: no cover
        say(error=f"Unsloth n'est pas prêt sur cet ordinateur : {e}")
        return 3

    train, val, held = load_list(a.train), load_list(a.val), load_list(a.heldout)
    if len(train) < 20 or not held:
        say(error="Pas assez de lignes.")
        return 2
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    try:
        model, tok = FastVisionModel.from_pretrained(a.base, load_in_4bit=True, use_gradient_checkpointing="unsloth")
    except Exception as e:
        say(error=f"Le modèle de départ n'est pas sur l'ordinateur (ou trop gros pour la carte graphique) : {e}")
        return 4

    def read(rows):
        FastVisionModel.for_inference(model)
        got = []
        for img, gt in rows:
            msgs = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}]
            text = tok.apply_chat_template(msgs, add_generation_prompt=True)
            inp = tok(Image.open(img).convert("RGB"), text, add_special_tokens=False, return_tensors="pt").to(model.device)
            ids = model.generate(**inp, max_new_tokens=160, do_sample=False)
            got.append((tok.decode(ids[0][inp["input_ids"].shape[1]:], skip_special_tokens=True).strip().split("\n")[0], gt))
        return got

    say(phase="before", accuracy=cer_accuracy(read(held)))
    model = FastVisionModel.get_peft_model(model, finetune_vision_layers=True, finetune_language_layers=True, finetune_attention_modules=True,
                                           finetune_mlp_modules=True, r=16, lora_alpha=16, lora_dropout=0, bias="none", random_state=3407)

    def conv(img, gt):
        return {"messages": [{"role": "user", "content": [{"type": "text", "text": PROMPT}, {"type": "image", "image": Image.open(img).convert("RGB")}]},
                             {"role": "assistant", "content": [{"type": "text", "text": gt}]}]}

    data = [conv(i, t) for i, t in train]
    stop_file = Path(a.out).parent / "cancel"

    class Progress(TrainerCallback):
        def on_epoch_end(self, args, state, control, **kw):
            loss = next((h.get("loss") for h in reversed(state.log_history) if "loss" in h), None)
            say(epoch=int(round(state.epoch or 0)), epochs=a.epochs, loss=loss)
            model.save_pretrained(str(out / "adapter"))  # le meilleur état atteint est gardé, même si on arrête
            tok.save_pretrained(str(out / "adapter"))
            say(adapter=str(out / "adapter"))
            if stop_file.exists():
                control.should_training_stop = True

    FastVisionModel.for_training(model)
    trainer = SFTTrainer(model=model, tokenizer=tok, data_collator=UnslothVisionDataCollator(model, tok), train_dataset=data, callbacks=[Progress()],
                         args=SFTConfig(per_device_train_batch_size=2, gradient_accumulation_steps=4, warmup_steps=5, num_train_epochs=a.epochs, learning_rate=2e-4,
                                        logging_steps=5, optim="adamw_8bit", weight_decay=0.01, lr_scheduler_type="linear", seed=3407, output_dir=str(out / "ckpt"),
                                        report_to="none", remove_unused_columns=False, dataset_text_field="", dataset_kwargs={"skip_prepare_dataset": True},
                                        max_seq_length=512, fp16=not torch.cuda.is_bf16_supported(), bf16=torch.cuda.is_bf16_supported()))
    trainer.train()
    model.save_pretrained(str(out / "adapter"))
    tok.save_pretrained(str(out / "adapter"))
    say(adapter=str(out / "adapter"))
    say(phase="after", accuracy=cer_accuracy(read(held)))
    try:  # pour Ollama : GGUF + Modelfile (selon la version d'Unsloth, possible ou non pour un modèle de vision)
        model.save_pretrained_gguf(str(out / "gguf"), tok, quantization_method="q4_k_m")
        ggufs = sorted((out / "gguf").glob("*.gguf"))
        if ggufs:
            (out / "Modelfile").write_text("".join(f"FROM ./gguf/{g.name}\n" for g in ggufs), encoding="utf-8")
            say(modelfile=str(out / "Modelfile"))
    except Exception as e:  # l'adaptateur LoRA reste utilisable avec Unsloth
        print(f"GGUF : {e}", file=sys.stderr, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
