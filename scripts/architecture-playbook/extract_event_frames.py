#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import os
import pathlib
import shutil
import sys


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--bvid", required=True)
    parser.add_argument("--event-candidates", required=True)
    return parser.parse_args()


def ensure_private(path_value, private_root):
    resolved = path_value.resolve()
    try:
        resolved.relative_to(private_root.resolve())
    except ValueError as error:
        raise SystemExit(f"private path escape: {resolved}") from error
    return resolved


def main():
    args = parse_args()
    project_root = pathlib.Path(args.project_root).resolve()
    private_root = project_root / ".local/architecture-playbook"
    sys.path.insert(0, str(private_root / "tools/python"))
    source = ensure_private(
        private_root / f"sources/{args.bvid}/source-360p.mp4",
        private_root,
    )
    candidates_path = ensure_private(
        pathlib.Path(args.event_candidates),
        private_root,
    )
    frame_root = ensure_private(
        private_root / f"frames/{args.bvid}",
        private_root,
    )
    if frame_root.exists():
        raise SystemExit(f"refusing to overwrite frame directory: {frame_root}")
    if not source.is_file() or not candidates_path.is_file():
        raise SystemExit("source media and event-candidates.json are required")
    candidates = json.loads(candidates_path.read_text(encoding="utf-8"))
    if (
        candidates.get("schema_version") != 1
        or candidates.get("bvid") != args.bvid
        or candidates.get("selection_method") != "transcript-teaching-events-v1"
        or candidates.get("review_status") != "reviewed"
        or not candidates.get("candidates")
    ):
        raise SystemExit("event candidates are not reviewed teaching events")

    import av
    from PIL import Image, ImageDraw

    temporary_root = frame_root.with_name(
        f"{frame_root.name}.{os.getpid()}.tmp"
    )
    if temporary_root.exists():
        raise SystemExit(f"temporary frame directory exists: {temporary_root}")
    temporary_root.parent.mkdir(parents=True, exist_ok=True)
    temporary_root.mkdir()
    records = []
    images = []
    try:
        with av.open(str(source)) as container:
            stream = container.streams.video[0]
            for ordinal, event in enumerate(candidates["candidates"], start=1):
                if event.get("review_status") != "reviewed":
                    raise RuntimeError("unreviewed event candidate reached extractor")
                target_seconds = event["target_ms"] / 1000
                target_pts = int(target_seconds / float(stream.time_base))
                container.seek(target_pts, stream=stream, backward=True, any_frame=False)
                selected = None
                for frame in container.decode(stream):
                    frame_seconds = float(frame.pts * stream.time_base)
                    selected = frame
                    if frame_seconds >= target_seconds:
                        break
                if selected is None:
                    raise RuntimeError(f"no frame decoded for {event['target_ms']}")
                actual_ms = round(float(selected.pts * stream.time_base) * 1000)
                image = selected.to_image()
                if image.width > 960:
                    height = round(image.height * 960 / image.width)
                    image = image.resize((960, height), Image.Resampling.LANCZOS)
                filename = (
                    f"{ordinal:02d}-{actual_ms:09d}-{event['event_label']}.jpg"
                )
                output = temporary_root / filename
                image.save(output, format="JPEG", quality=90, optimize=True)
                digest = hashlib.sha256(output.read_bytes()).hexdigest()
                records.append({
                    "frame_id": event["candidate_id"],
                    "transcript_segment_ids": event["transcript_segment_ids"],
                    "target_ms": event["target_ms"],
                    "actual_ms": actual_ms,
                    "event_label": event["event_label"],
                    "selection_reason": event["selection_reason"],
                    "filename": filename,
                    "sha256": digest,
                    "width": image.width,
                    "height": image.height,
                    "visual_review_status": "pending",
                })
                images.append((image.copy(), ordinal, actual_ms, event["event_label"]))

        canonical = json.dumps(
            records,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        document = {
            "schema_version": 1,
            "bvid": args.bvid,
            "source_segment_index_sha256": candidates[
                "source_segment_index_sha256"
            ],
            "selection_method": "transcript-teaching-events-v1",
            "event_selected": True,
            "frame_count": len(records),
            "frame_index_sha256": hashlib.sha256(canonical).hexdigest(),
            "frames": records,
        }
        (temporary_root / "event-frame-index.json").write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        write_contact_sheet(images, temporary_root / "contact-sheet.jpg", Image, ImageDraw)
        temporary_root.replace(frame_root)
    except Exception:
        shutil.rmtree(temporary_root, ignore_errors=True)
        raise

    print(json.dumps({
        "bvid": args.bvid,
        "frame_count": len(records),
        "frame_index_sha256": document["frame_index_sha256"],
    }))


def write_contact_sheet(images, output, image_module, draw_module):
    columns = 2
    thumb_width = 480
    thumb_height = round(images[0][0].height * thumb_width / images[0][0].width)
    caption_height = 56
    rows = math.ceil(len(images) / columns)
    sheet = image_module.new(
        "RGB",
        (thumb_width * columns, (thumb_height + caption_height) * rows),
        "white",
    )
    draw = draw_module.Draw(sheet)
    for index, (image, ordinal, actual_ms, event_label) in enumerate(images):
        thumb = image.resize((thumb_width, thumb_height), image_module.Resampling.LANCZOS)
        x = (index % columns) * thumb_width
        y = (index // columns) * (thumb_height + caption_height)
        sheet.paste(thumb, (x, y))
        draw.text((x + 8, y + thumb_height + 6), f"{ordinal:02d}  {actual_ms / 1000:.2f}s", fill="black")
        draw.text((x + 8, y + thumb_height + 26), event_label, fill="black")
    sheet.save(output, format="JPEG", quality=90)


if __name__ == "__main__":
    main()
