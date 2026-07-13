# Stage 7 M3 Next-Window Handoff

Date: 2026-07-13

This document is the durable handoff for continuing Stage 7 work in a fresh Codex window. Treat current Git state and command output as authoritative; use the values below to detect drift, not to skip inspection.

## User intent

The approved direction is:

1. Merge the completed Stage 7 M3 fixture-only foundation into its local base branch.
2. Verify the merged result.
3. Design and implement a read-only real-data-readiness toolchain plus focused M3 safety hardening.
4. Independently review and verify that work.

Hard constraints:

- Do not push or create a pull request.
- Do not start real-data training.
- Do not change Dataset v3 readiness to true or increase its eligible count.
- Do not enable Stage 7 M4 Apply Mode.
- Do not manufacture reviewer decisions, license evidence, canonical-front evidence, approved layers, or training eligibility.
- Keep normal Node generation Python-independent.
- Prefer sequential, quota-conscious execution. Do not dispatch parallel agents unless the user explicitly reauthorizes the extra usage.

## Authoritative Git topology at handoff

Main checkout:

- Path: `/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents`
- Branch: `codex/stage7-dataset-v3-extraction`
- HEAD: `d7ddbbb2c8f23cdfd94c7e61d450fa4717f7f8fd`
- Upstream: `origin/codex/stage7-dataset-v3-extraction`
- Upstream revision observed: `e0fb187a461fb6f1e4dc4aaf86ce4028d612c308`
- Status: clean
- `git pull --ff-only` was run immediately before the pause and reported `Already up to date.`

Completed M3 worktree:

- Path: `/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.worktrees/codex-stage7-m3-fixture-foundation`
- Branch: `codex/stage7-m3-fixture-foundation`
- Implementation HEAD before this handoff-only commit: `758ecf7431e2991ef5da6255aec2cb867769eab8`
- Status before writing this document: clean
- Base: `d7ddbbb2c8f23cdfd94c7e61d450fa4717f7f8fd`

The M3 branch has **not** been merged, pushed, rebased, reset, or deleted. No real training or M4 work has started.

## What M3 completed

M3 adds an optional fixture-only Python/PyTorch subsystem under `training/stage7/` and connects it to the existing Node shadow boundary:

- two isolated committed synthetic fixtures;
- fail-closed fixture and real Dataset v3 constructors;
- deterministic condition encoding and three-layer `64^3` categorical targets;
- a tiny conditional voxel VAE for CPU smoke training;
- reproducible fixture-only checkpoints, manifests, metrics, and inference plans;
- canonical Stage 7 plan inference validated again by authoritative Node code;
- an explicit Python shadow provider that cannot change primary operations;
- strict UTF-8, bounded subprocess I/O/time, immutable private input snapshots, provenance checks, cleanup, schema validation, repair/conversion/rejection, and rule-only fallback;
- cross-runtime CPU acceptance and replayable benchmark evidence;
- real-mode layer admission requiring `envelope`, `space`, and `site` exactly once, in any order, so a complete returned plan cannot bypass layer governance.

Key documents:

- Design: `docs/superpowers/specs/2026-07-13-stage-7-dataset-v3-m3-fixture-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-07-13-stage-7-m3-fixture-foundation.md`
- Benchmark: `docs/benchmarks/stage7-m3-fixture-foundation.md`
- Python guide: `training/stage7/README.md`

Implementation commits after the base:

```text
0f39461 feat(stage7): add isolated M3 fixture package
68b9c64 feat(stage7): gate M3 dataset loading
2fd8963 fix(stage7): reject fixture artifacts in real mode
8427bc4 feat(stage7): encode M3 conditions and targets
46caa3e feat(stage7): add tiny conditional voxel VAE
f809612 feat(stage7): train reproducible fixture checkpoints
28dfff8 feat(stage7): emit canonical M3 inference plans
7017190 fix(stage7): harden M3 inference boundaries
e3f67ee feat(stage7): connect M3 python shadow provider
215a857 fix(stage7): bind python provider inputs
77319ba fix(stage7): snapshot python provider inputs
5af6e03 feat(stage7): complete M3 fixture foundation
710ebf3 docs(stage7): make M3 evidence replayable
758ecf7 fix(stage7): enforce complete real layer admission
```

## Fresh final evidence already obtained

The original window independently reran these after all implementation fixes:

- Stage 7 Python: 187 collected tests, full run exit 0.
- Full Node: 445 tests, exit 0 under Node 24.18.0.
- Focused Node boundary suite: 43/43.
- Documentation tests: 2/2.
- `pip check`: no broken requirements.
- Independent global review: its single Important layer-governance finding was fixed in `758ecf7` and a fresh reviewer approved the fix with no Critical, Important, or Minor findings.

Pinned CPU acceptance, executed from the final implementation checkout:

```text
acceptance.json              ab91df7b6ecf76ec942dab86c5cdee0ff4e870016abb4684855e51a6a64bc3f5
checkpoint                   938c3d031765ef921b8a8e77f2d069f2a80507eab698167f727b6bc60065d302
checkpoint manifest          4c90298c3615d9af892b275acc7b1f1d0a809d247efdf32cca95709c7de0071e
canonical inference plan     d17a8f99bc390ed11f621854f80c070b270a6b6319a03c7e2679a6902b34c6ae
ordered primary operations   3499ee8ed27dc991161e9acca64848de151b886617d945a1012d126addd5a447
primary operation count      1081
shadow operation parity      true
real training started        false
Apply Mode available         false
```

Dataset manifests remained byte-identical:

```text
v1 fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749
v2 af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654
v3 5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082
```

Dataset v3 gate at handoff:

```text
ready_for_m3_real_data=false
training_eligible_count=0
```

The six real pilots still have zero reviewed training approvals.

## Required first actions in the next window

Start read-only. Do not trust this handoff until these commands agree:

```bash
git -C /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents status --short
git -C /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents branch --show-current
git -C /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents rev-parse HEAD
git -C /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.worktrees/codex-stage7-m3-fixture-foundation status --short
git -C /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.worktrees/codex-stage7-m3-fixture-foundation branch --show-current
git -C /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.worktrees/codex-stage7-m3-fixture-foundation rev-parse HEAD
git -C /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents merge-base codex/stage7-dataset-v3-extraction codex/stage7-m3-fixture-foundation
```

If both worktrees are clean and the merge base is `d7ddbbb...`, finish the already-authorized local integration:

1. In the main checkout, merge `codex/stage7-m3-fixture-foundation` into `codex/stage7-dataset-v3-extraction` with `git merge --ff-only`.
2. Run the merged Python, Node, focused boundary, documentation, Dataset hash/diff, gate, and hygiene checks.
3. Remove the M3 linked worktree and delete the M3 feature branch only after the merged result passes.
4. Do not push.

Node child processes can return false `EPERM` failures inside the sandbox. Use Node 24.18.0 at `/home/guoba/.nvm/versions/node/v24.18.0/bin/node` and request the normal scoped sandbox escalation when a test genuinely launches nested Node processes.

## Next-stage design boundary

After merge verification, do not jump directly into implementation. Use the repository's required brainstorming and planning workflow. The approved problem is broad, so decompose it before coding.

Recommended first subproject: a **read-only real-case readiness audit** that consumes immutable Dataset v3 metadata and existing review artifacts, then emits deterministic JSON and Markdown blocker reports for all six pilots. It may explain missing evidence but must never create approvals or mutate Dataset v3.

Candidate second subproject: focused M3 adversarial hardening for loader/provider boundaries not already covered, selected only from concrete audit or review evidence. Avoid speculative refactoring and new runtime dependencies.

The readiness design should define at least:

- stable blocker codes for reviewer identity/decision, licensing, canonical front, approved learning layers, semantic acceptance, exact v3 plan binding, local artifact hash, and gate contribution;
- source paths and hashes for every assertion;
- deterministic ordering and canonical JSON;
- a human-readable report generated from the same canonical result;
- fail-closed behavior for missing, malformed, stale, ambiguous, or path-escaping evidence;
- explicit `advisory_only: true`, `mutates_dataset: false`, and `authorizes_training: false` claims;
- tests proving it cannot change `ready_for_m3_real_data`, `training_eligible_count`, case approvals, or Dataset v1/v2/v3 bytes;
- no real-data tensor loading or training path;
- no M4 Apply Mode changes.

Write and obtain user approval for a focused design spec before implementation, then write a detailed TDD implementation plan. Keep commits small and independently reviewable.

## Quota-conscious execution guidance

- Use one main agent sequentially by default.
- Do not use Fast mode.
- Run focused tests during development and the full suites only at task boundaries and final verification.
- Put durable decisions in committed specs, plans, and reports so a later window does not need the full transcript.
- Use stronger models for architecture/security review and a lighter supported Codex model for mechanical implementation when appropriate.
- Stop for genuine human evidence decisions rather than spending tokens trying to infer or fabricate them.

## Copy/paste prompt for the next window

```text
Open the repository at /home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents and read the full handoff at:
/home/guoba/MC_Architecture_Agent/Minecraft-Constructing-Agents/.worktrees/codex-stage7-m3-fixture-foundation/docs/superpowers/handoffs/2026-07-13-stage-7-m3-next-window.md

Follow it as the authoritative continuation protocol, but first verify every recorded Git fact with read-only commands. The completed M3 branch must be merged locally into codex/stage7-dataset-v3-extraction and verified before any new feature work. Do not push, do not perform real-data training, do not change Dataset v3 gate false/0, and do not enable M4 Apply Mode.

After the merge is verified, use the required brainstorming workflow to design the first focused read-only real-case readiness audit. Work quota-consciously and sequentially; do not spawn parallel agents unless I explicitly approve the extra usage. Present the design for my approval before writing implementation code.
```
