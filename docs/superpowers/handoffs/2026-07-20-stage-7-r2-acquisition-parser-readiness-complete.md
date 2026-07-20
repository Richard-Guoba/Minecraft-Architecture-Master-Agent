# Stage 7 R2 Acquisition and Parser Readiness Completion Handoff

Date: 2026-07-20

## Scope completed

R2 added only synthetic quarantine containment, bounded Minecraft Java Structure NBT decoding, strict complete-single-structure validation, deterministic centered nine-token voxel preparation, structural and MinHash fingerprints, append-only readiness events, and boundary tests. No real candidate was acquired, parsed, prepared, fingerprinted, admitted, split, or trained.

## Git state

- Branch: `codex/stage7-r2-readiness`
- Pre-handoff implementation HEAD: `543a462861275fb1ca5b4167ac10f3ba4aa40998`
- Plan commit: `9e032d89e574cdbd93021e6bbbdf7b64b58725f4 docs(stage7): plan R2 acquisition readiness`
- Task 1: `46e86a85f31e5003f812554476db31d042023e83 feat(stage7): add candidate quarantine boundary`
- Task 2: `d1ab2cdcf38b989f0984ef5e7691ddc923367ae3 feat(stage7): add bounded candidate NBT decoder`
- Task 3: `596358e732d148bc2e3b29cc79b215e0c345702c feat(stage7): validate Java structure NBT`
- Task 4: `b4259380cdce46835c702971e1311dc93e101990 feat(stage7): prepare conditional voxel candidates`
- Task 5: `6ec1f89466663ee6c63f934a70c463798d12d236 feat(stage7): fingerprint conditional candidates`
- Task 6: `57a55efc19127c88a7e15c6cf72620022acb0838 feat(stage7): record synthetic candidate readiness`
- Task 7: `2eb2a8ef67521cf1c864275afa34a8184be984a4 test(stage7): verify synthetic candidate pipeline`
- Task 8: `543a462861275fb1ca5b4167ac10f3ba4aa40998 docs(stage7): document R2 synthetic boundary`

The handoff commit follows this implementation HEAD. Nothing was pushed.

## Verification evidence

- Full Node suite with Node.js 24.18.0: 587 passed, 0 failed.
- Complete Stage 7 Python suite: 269 passed, 0 failed.
- The R2 focused, integration, documentation, R1 compatibility, and boundary tests all completed within the full Node result.

## Preserved boundaries

The ignored private research root remains aggregate-only at 22 active sources, 42 deferred oversized sources, 22 source records, 22 prepared records, and 22 prepared `64^3` binaries. Every prepared binary retains the expected size. The deterministic split remains 15 training cases and 7 validation cases, and the run root remains at three existing run directories.

Formal Dataset manifest SHA-256 values remain:

- Dataset v1: `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`
- Dataset v2: `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`
- Dataset v3: `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`

Dataset v3 remains `ready_for_m3_real_data=false` and `training_eligible_count=0`.

## R2 operational state

The operational source-expansion root contains zero R2 quarantine payload files, zero prepared files, and zero fingerprint files. R2 added no npm command, downloader, archive reader, Dataset writer, Python hook, trainer, or M4 surface. All R2 payload-path tests used only generated fixtures under fresh operating-system temporary roots.

## Next owner gate

R3 remains blocked until five exact admission-contract-ready Minecraft Java Structure NBT candidates are named across multiple independent sources and building categories, their rights evidence is refreshed, and the owner explicitly approves those exact assets under a separate design and plan. R3 does not authorize training. Any later training requires a new literal device and a positive optimizer-step budget from the owner.
