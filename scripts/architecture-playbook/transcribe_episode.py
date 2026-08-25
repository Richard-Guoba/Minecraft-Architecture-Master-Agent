#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import pathlib
import sys


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--bvid", required=True)
    parser.add_argument("--model", choices=["small"], required=True)
    parser.add_argument("--device", choices=["cpu"], required=True)
    parser.add_argument("--compute-type", choices=["int8"], required=True)
    parser.add_argument("--language", choices=["zh"], required=True)
    parser.add_argument("--beam-size", type=int, choices=[5], required=True)
    parser.add_argument("--word-timestamps", choices=["true"], required=True)
    return parser.parse_args()


def ensure_private(path_value, private_root):
    resolved = path_value.resolve()
    try:
        resolved.relative_to(private_root.resolve())
    except ValueError as error:
        raise SystemExit(f"private path escape: {resolved}") from error
    return resolved


def hash_file(path_value):
    digest = hashlib.sha256()
    byte_size = 0
    with path_value.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
            byte_size += len(chunk)
    return digest.hexdigest(), byte_size


def main():
    args = parse_args()
    project_root = pathlib.Path(args.project_root).resolve()
    private_root = project_root / ".local/architecture-playbook"
    private_packages = private_root / "tools/python"
    sys.path.insert(0, str(private_packages))

    source = ensure_private(
        private_root / f"sources/{args.bvid}/source-360p.mp4",
        private_root,
    )
    media_index_path = ensure_private(
        private_root / f"sources/{args.bvid}/media-index.json",
        private_root,
    )
    output = ensure_private(
        private_root / f"transcripts/{args.bvid}/draft-transcript.json",
        private_root,
    )
    model_root = ensure_private(private_root / "tools/models", private_root)

    if output.exists():
        raise SystemExit(f"refusing to overwrite existing transcript: {output}")
    if not source.is_file() or not media_index_path.is_file():
        raise SystemExit("verified media and media-index.json are required")
    media_index = json.loads(media_index_path.read_text(encoding="utf-8"))
    source_sha256, source_byte_size = hash_file(source)
    if (
        media_index.get("bvid") != args.bvid
        or media_index.get("sha256") != source_sha256
        or media_index.get("byte_size") != source_byte_size
    ):
        raise SystemExit("media index does not match source bytes")

    from faster_whisper import WhisperModel

    model_root.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
        cpu_threads=min(os.cpu_count() or 1, 8),
        num_workers=1,
        download_root=str(model_root),
    )
    segments_iterator, info = model.transcribe(
        str(source),
        language=args.language,
        task="transcribe",
        beam_size=args.beam_size,
        word_timestamps=True,
        vad_filter=True,
        condition_on_previous_text=True,
        log_progress=True,
    )

    segments = []
    for segment in segments_iterator:
        words = []
        for word in segment.words or []:
            words.append({
                "start_ms": round(word.start * 1000),
                "end_ms": round(word.end * 1000),
                "text": word.word,
                "probability": round(word.probability, 6),
            })
        segments.append({
            "id": segment.id,
            "start_ms": round(segment.start * 1000),
            "end_ms": round(segment.end * 1000),
            "text": segment.text.strip(),
            "avg_logprob": round(segment.avg_logprob, 6),
            "no_speech_prob": round(segment.no_speech_prob, 6),
            "words": words,
        })

    if not segments:
        raise SystemExit("ASR produced no transcript segments")
    segment_bytes = json.dumps(
        segments,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    document = {
        "schema_version": 1,
        "bvid": args.bvid,
        "source_sha256": source_sha256,
        "processor": {
            "name": "faster-whisper",
            "version": "1.2.1",
            "model": args.model,
            "device": args.device,
            "compute_type": args.compute_type,
            "language": args.language,
            "beam_size": args.beam_size,
            "word_timestamps": True,
            "vad_filter": True,
            "condition_on_previous_text": True,
        },
        "detected_language": info.language,
        "language_probability": round(info.language_probability, 6),
        "duration_ms": round(info.duration * 1000),
        "duration_after_vad_ms": round(info.duration_after_vad * 1000),
        "segment_count": len(segments),
        "segment_index_sha256": hashlib.sha256(segment_bytes).hexdigest(),
        "segments": segments,
    }
    temporary = output.with_suffix(f".json.{os.getpid()}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as target:
            json.dump(document, target, ensure_ascii=False, indent=2)
            target.write("\n")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)

    print(json.dumps({
        "bvid": args.bvid,
        "segment_count": len(segments),
        "duration_ms": document["duration_ms"],
        "language": document["detected_language"],
        "language_probability": document["language_probability"],
        "segment_index_sha256": document["segment_index_sha256"],
    }))


if __name__ == "__main__":
    main()
