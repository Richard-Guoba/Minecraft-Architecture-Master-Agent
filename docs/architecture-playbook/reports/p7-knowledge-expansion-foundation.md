# P7 knowledge-expansion foundation report

Status: foundation only; no new chapter evidence or rule promotion is claimed

## Checked-in authority

- The authoritative chapter assignment is
  [`course/chapter-plan-v1.json`](../course/chapter-plan-v1.json).
- Exact chapter-plan file SHA-256:
  `c7b1ff6c8fb3d4a6d0003c224c51fe0531a0854a2efe149bcee26daecf9a2e84`.
- The plan binds 8 ordered chapters, all 50 unique manifest episodes, and
  51,992 seconds. The remaining non-pilot episode count is 44.
- The first chapter ID is `foundations-tools-blocks-modularity-color`; it
  contains course orders 1 through 7.

## Restartable ledger contract

The ledger uses `schema_version: 1`, binds the validated chapter plan and all
50 episode identities, and records `episode_count`, `unresolved_count`, the
last completed action, and per-episode chapter, course order, stage, and
hash/count evidence fields. Publication uses an exact-byte SHA-256 token for
compare-and-swap; initialization exclusively owns the absent-to-created
transition, and later updates must name the expected ledger hash and one
adjacent stage.

The ordered stages are:

```text
pending
media-verified
asr-complete
events-indexed
visual-reviewed
evidence-packed
notes-reviewed
rules-reviewed
```

State is private and restartable. Public command results expose counts,
episode identities, stages, and the next command, but no working-storage
location or source-derived content.

## Commands

Initialize a missing ledger with the sole public absent-to-created command:

```bash
npm run playbook:chapter -- init
```

If a valid ledger already exists, including one with recorded progress, this
returns an `unchanged` public summary and does not reset or advance any episode.
Then read the global or first-chapter status with:

```bash
npm run playbook:chapter -- status
npm run playbook:chapter -- status --chapter foundations-tools-blocks-modularity-color
```

Ask for the deterministic next action with:

```bash
npm run playbook:chapter -- next --chapter foundations-tools-blocks-modularity-color
```

`status` and `next` remain read-only; neither creates nor advances the ledger.

For a newly initialized ledger, the next exact evidence command is:

```bash
npm run playbook:evidence -- media --bvid BV1guoPYkExk
```

The evidence CLI now resolves every approved manifest episode through the
checked-in manifest and chapter assignment while preserving the six prior
episode identities.

## Controller verification through Task 4

All focused Node.js checks below ran through the repository's mandatory
hard-memory test entry point; direct Node test execution and soft fallback
were not used.

- Chapter assignment and prior course contracts: 12/12 passed.
- Restartable ledger and private-path contracts: 19/19 passed.
- All-episode evidence resolution and six-episode compatibility: 17/17 passed.
- Read-only chapter status/next and ledger regressions: 25/25 passed.

These are focused foundation results. Final whole-project verification and a
portable datapack smoke run remain separate completion checks.

## Boundaries and next checkpoint

This is a foundation only. It does not complete the remaining 44 episode
reviews, import prior evidence into a new ledger automatically, advance a
stage without a separately validated artifact adapter, publish new notes or
rules, change the production playbook default, complete formal P6 comparison,
or claim aesthetic improvement.

The immediate operational checkpoint is to initialize the chapter ledger,
confirm the first-chapter `status` and `next` results, then execute exactly:

```bash
npm run playbook:evidence -- media --bvid BV1guoPYkExk
```

Any later stage transition must be backed by the exact reviewed artifact
required for that stage. Formal P6 work remains optional and nonblocking.
