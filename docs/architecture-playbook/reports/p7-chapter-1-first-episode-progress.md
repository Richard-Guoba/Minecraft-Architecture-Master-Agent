# P7 Chapter 1 First-Episode Progress

Date: 2026-09-01

## Outcome

The reusable Chapter 1 evidence path now accepts any manifest-bound episode while preserving the six-episode pilot behavior. A new public `playbook:chapter advance --bvid <BVID>` operation reopens and validates the exact private artifact required by the current stage before it performs a compare-and-swap ledger update.

The first approved Chapter 1 episode, `BV1guoPYkExk`, was processed sequentially from `pending` through `media-verified` to `asr-complete`. Processing stopped at the first genuine human review boundary. No visual event, evidence note, or rule was approved.

## Verified private artifacts

- Media: 10,920,142 bytes; SHA-256 `6f69be9048be2732c484ecb222fd03948795697e3aea147c44615389e8bca185`.
- ASR lineage: one segment; SHA-256 `f0cfdeea55055bf5d2e9259b288821bc9740b8a8d1b166b6147202b951f62c00`.
- ASR review: the only detected speech is a 260 ms, low-confidence subtitle-credit phrase with `no_speech_prob` 0.716547. It cannot support a teaching-event claim.
- Visual survey: 13 evenly spaced private frames were extracted to `.local/architecture-playbook/work/p7/review/BV1guoPYkExk/`; every sample remains explicitly pending human review.

Raw media, transcript, survey frames, and the restart ledger remain under ignored `.local/architecture-playbook/`. They are not Git artifacts.

## Fail-closed advancement

The verifier supports the machine and reviewed-artifact transitions through `evidence-packed`:

1. `pending` to `media-verified`: stream and hash the exact media bytes and match the media index.
2. `media-verified` to `asr-complete`: validate source binding, timestamps, segment lineage, and canonical segment hash.
3. `asr-complete` to `events-indexed`: require a reviewed teaching-event index bound to the transcript.
4. `events-indexed` to `visual-reviewed`: require every recorded frame to be visually reviewed and match its stored byte hash.
5. `visual-reviewed` to `evidence-packed`: rebuild the EvidencePack exactly from the reopened private inputs and compare its bytes.

Only after artifact validation does the verifier reopen the ledger, confirm prior evidence and stage, and use the ledger SHA for its adjacent transition. Tests cover changed media, transcript source drift, unreviewed events, pending and modified frames, and EvidencePack drift; every rejection leaves the ledger unchanged.

## Current boundary

`npm run playbook:chapter -- next --chapter foundations-tools-blocks-modularity-color` now reports:

- current stage: `asr-complete`
- next stage: `events-indexed`
- human review required: yes
- required artifact: `reviewed teaching-event index`
- next command after that artifact is reviewed: `npm run playbook:chapter -- advance --bvid BV1guoPYkExk`

Because this episode is a silent architectural showcase, transcript-derived event selection is not defensible. A reviewer must inspect the private survey/video and decide whether visually grounded events should be admitted under a separately reviewed method or whether the episode contributes no teachable evidence. Until that decision is recorded, the ledger must remain at `asr-complete` and Chapter 1 must not scale to later episodes.

## Compatibility and scope

- The primary school remains only `heihui-jileniao`.
- No external creator or generic architectural rule was added.
- No note or rule artifact changed.
- No Minecraft world was requested, opened, or modified.
- P6 capture and blind comparison remain optional QA.
- `playbook=off` behavior and portable relative-coordinate datapack authority remain unchanged.
