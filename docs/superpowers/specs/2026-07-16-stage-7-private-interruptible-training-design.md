# Stage 7 Private-Research Interruptible Training Design

**Date:** 2026-07-16

**Status:** approved for planning; not authorization to implement or start training

**Extends:** `2026-07-15-stage-7-private-research-quality-evaluation-design.md`

## 1. Purpose

The first substantive private CPU run completed quickly enough to make a longer local experiment practical. The next proposed run should fit comfortably inside an eight-hour overnight window, show useful progress and loss information in the owner's local terminal, and survive a deliberate pause or ordinary process interruption without discarding the whole run.

The existing trainer has no periodic checkpoint or resume contract. It holds metrics in memory and writes the four final training artifacts only after the last optimizer step. This design adds interruptible training as a new versioned private-run protocol. It does not retrofit or mutate either existing run.

The proposed target is 185,946 optimizer steps. At the previously observed CPU throughput, this represents about six hours and 24 minutes of training and leaves approximately 20 percent of an eight-hour window for preflight, checkpointing, evaluation, and normal performance variation. This target is a planning value, not permission to run it.

## 2. Immutable boundaries

All existing private-research boundaries remain in force:

- Private sources and prepared volumes remain below `.local/stage7-private-research/`. Every runtime file, exact loss, metric, reconstruction, checkpoint, optimizer state, weight, hash, and generated output created by this feature remains below `.local/stage7-private-research/runs/`. None is pushed, published, uploaded, shared, packaged, or exported.
- Dataset v1, v2, and v3 remain byte-for-byte unchanged. Dataset v3 remains `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- The private model remains disconnected from Dataset v3, M3 fixture and real-data paths, normal Node generation, the primary provider, and M4 Apply Mode.
- The 42 deferred oversized buildings remain untouched. This work adds no tiling, cropping, rescaling, or oversized-building processing.
- Normal Node generation remains Python-independent.
- Work remains sequential. No parallel agents, concurrent private runs, or hyperparameter searches are permitted.
- The two existing version-one runs remain immutable, non-resumable evidence. Their artifact contracts remain exactly as previously audited.
- A new real private run requires a fresh owner-approved device and exact positive step count after implementation, testing, and a new operational handoff are complete.

Exact loss and quality values may appear only in ignored local files and in the owner's explicitly opted-in interactive terminal. Codex-facing and metadata-only output must not expose them.

## 3. Approaches considered

### A. Cooperative file-based control protocol — selected

The trainer owns one run lock, polls an atomic pause request after each optimizer step, writes periodic two-slot snapshots, and exposes atomic progress files. Separate local commands monitor, pause, and resume the run.

This approach is inspectable, testable, works whether the trainer was launched by the owner or by an automation shell, and does not depend on a terminal remaining attached. It also permits the pause command to wait for positive acknowledgement that the recovery snapshot is durable.

### B. Unix signals as the primary protocol — rejected

Signals are convenient for a foreground process but carry little structured state, are awkward to acknowledge from a separate command, and are less portable. `SIGINT` and `SIGTERM` remain defense-in-depth inputs to the selected cooperative pause path, not the control contract.

### C. External `tmux`, `systemd`, or process-manager orchestration — rejected

An external manager could provide logs and restart behavior, but it would add host-specific state outside the private run directory and could restart a run without repeating the private boundary checks. The private trainer must remain self-contained and fail closed.

## 4. Components and responsibilities

The implementation separates five responsibilities:

1. **Trainer:** performs preflight, creates only fresh version-two runs, executes optimizer steps, publishes progress, checkpoints every five active minutes, responds to pause, and finalizes only at the exact target step.
2. **Run-state module:** defines schemas, state transitions, configuration and corpus bindings, atomic JSON writes, run locking, memory checks, and completion rules.
3. **Snapshot module:** serializes, validates, rotates, and restores the two safe recovery slots using a weights-only load path.
4. **Control commands:** submit and acknowledge a pause request or resume an existing paused/interrupted run without changing its training configuration.
5. **Local monitor:** reads progress without mutating the run and renders an interactive progress bar. It reads exact loss only when the owner explicitly opts in.

Each component operates only on a caller-selected run below the ignored private `runs/` directory. No component discovers or uploads remote state.

## 5. Run state machine

The version-two state machine is:

```text
initializing -> running
running -> pause_requested -> paused -> running
running -- detected dead process --> interrupted -> running
running -- exact target --> completed
```

The rules are:

- `initializing` exists only while a fresh run records and verifies its immutable bindings.
- A trainer must hold an exclusive operating-system lock on `.runtime/run.lock` before entering `running`. A second trainer for the same run fails immediately.
- The pause command writes a monotonically increasing request identifier. The trainer observes it only at an optimizer-step boundary, changes to `pause_requested`, writes and validates a fresh snapshot, records the acknowledgement, changes to `paused`, and releases the run lock.
- A dead process whose last durable state was `running` is treated as `interrupted` only after a resume command acquires the abandoned operating-system lock and validates the run. Stale file contents alone never prove that a process is dead.
- Resume may transition only a valid `paused` or `interrupted` version-two run back to `running`.
- If the target step has been reached, completion takes precedence over a simultaneous pause request. The trainer writes a terminal recovery snapshot and idempotently finalizes the run instead of pausing at the target.
- `completed` is terminal. A completed run cannot resume, extend its target, or accept another pause request.

## 6. Version-two runtime artifact contract

A version-two run retains the existing final research artifacts and adds a `.runtime/` directory. Its state-dependent files are:

```text
<run-id>/
  .runtime/
    run.lock
    run-state.json
    progress.json
    private-progress.json
    pause-request.json          # after the first request; retained as audit state
    resume-a.pt                # generation-zero slot exists before step one
    resume-b.pt                # appears on the first successful rotation
    resume-pointer.json
  metrics.jsonl                # only after exact-target finalization
  reconstruction.bin           # only after exact-target finalization
  checkpoint.pt                # only after exact-target finalization
  checkpoint_manifest.json     # written last among final artifacts
  evaluation.json              # only after a completed run is evaluated
```

Temporary files use fixed names inside `.runtime/`, are never accepted as completed artifacts, and are replaced atomically. Any unknown file, unexpected symbolic link, path escape, incomplete final set, or leftover temporary file blocks completion audit and evaluation.

`run-state.json` is metadata-safe. It records schema version, run status, immutable configuration, completed and target steps, active and paused durations, pause reason, snapshot generation, and non-secret boundary results. It contains no loss, voxel content, tensor, private filename, case identifier, source URL, absolute path, or private artifact hash.

`progress.json` is also metadata-safe. It is atomically refreshed at most once per second and contains completed/target steps, percentage, recent throughput, active elapsed time, estimated remaining active time, state, and snapshot age.

`private-progress.json` is explicitly private metric state. It contains the current finite loss and a finite rolling 100-step mean for the local monitor. Metadata-only tools never open or print it.

The final manifest version identifies the run as version two and declares the complete allowed artifact inventory. The evaluator keeps the existing exact version-one four-file/five-file rules unchanged and applies the new exact version-two inventory only when the run manifest explicitly selects it.

## 7. Snapshot schema and atomic commit

Every recovery snapshot contains only strictly validated tensors and primitive schema values compatible with a weights-only load path:

- ordered CPU model state;
- optimizer state, including every tensor and scalar required to continue exactly;
- completed and target steps;
- the finite loss prefix as a compact tensor rather than a Python object per step;
- the most recent reconstruction tensor when `completed_steps > 0`, so a terminal snapshot can finish finalization without repeating an optimizer step; the generation-zero snapshot has no reconstruction;
- Torch, Python, and NumPy random state encoded as validated tensors or primitives;
- seed, batch size, learning rate, device, model identity, and deterministic-algorithm settings;
- code revision and training-code identity;
- prepared-manifest, split, private-scope, distribution, formal Dataset, and false/zero gate bindings; and
- snapshot generation and active-time accounting.

Snapshots rotate between fixed `resume-a.pt` and `resume-b.pt` slots. They do not accumulate. Before the first optimizer step, initialization commits a generation-zero `resume-a.pt` snapshot and points to it, so an interruption before five minutes can restart from step zero. The first successful rotation creates `resume-b.pt`; both fixed slots exist thereafter. A snapshot is written every 300 seconds of active `running` time, on every acknowledged pause, when the memory safety threshold is crossed, and at the target step before finalization.

The atomic protocol is:

1. write and `fsync` a temporary file for the inactive slot;
2. load it through the normal strict weights-only validator and compute its local integrity hash;
3. atomically replace the inactive slot and `fsync` the containing directory;
4. atomically replace and `fsync` `resume-pointer.json`; and
5. only then report the new snapshot generation in progress state.

The previously active slot remains valid until the pointer update commits. Resume first validates the pointer-selected slot. If it is invalid, it may use the other slot only when that complete snapshot independently passes every schema, integrity, run, code, configuration, corpus, split, Dataset, gate, and step-monotonicity check. If neither slot passes, resume stops without modifying the run.

## 8. Exact resume and finalization semantics

Resume begins with the same read-only Git and private preflight used for a fresh run. It then requires:

- an exact clean code revision and training-code identity match;
- exact run ID, device, seed, batch size, learning rate, model, target steps, and deterministic settings;
- exact source/prepared/split bindings and unchanged formal Dataset hashes and false/zero gate;
- a valid run lock, state transition, snapshot generation, optimizer state, loss prefix, random state, and completed-step range; and
- no completed manifest or conflicting partial artifact.

The resume command does not accept configuration overrides. In particular, it cannot change the target steps, device, seed, batch size, or learning rate.

Final output files are each written atomically. `checkpoint_manifest.json` is written only after the model checkpoint, metrics, and reconstruction have been written and validated. `run-state.json` changes to `completed` only after the final manifest and complete artifact set pass validation.

If the process dies during finalization, the terminal snapshot remains authoritative. A later resume revalidates any already present final file, preserves a matching file, writes only a missing file, and fails on a mismatch. It never repeats the target optimizer step and never overwrites a conflicting partial final artifact.

## 9. Commands and local operator experience

The implementation exposes four separate private commands following the existing package-script style:

### 9.1 Start

The existing private training entry point creates a fresh version-two run. It requires the private acknowledgement, metadata-only automation output, a fresh safe run ID, and an exact owner-approved device and step count. The checkpoint interval is fixed at 300 seconds for this first version rather than exposed as an experimental tuning control.

### 9.2 Monitor

The monitor is read-only and displays:

- state and a dynamic step progress bar;
- completed and target steps and percentage;
- active elapsed time, recent steps per second, and estimated active time remaining; and
- the age of the latest committed snapshot.

By default it reads only `progress.json`. `--show-private-loss` explicitly permits it to read `private-progress.json` and display current loss plus the rolling 100-step mean. Loss display is allowed only when standard output is an interactive terminal. If output is redirected or non-interactive, the command refuses loss mode rather than writing private metrics to a log. Codex uses only metadata mode and never reproduces the loss values in chat.

### 9.3 Pause

The pause command validates containment and run identity, atomically records a new request identifier, and waits by default for up to 120 seconds. It reports success only after the trainer records the same acknowledgement, validates the new snapshot, enters `paused`, and releases the run lock. Repeating a pending request is idempotent. Timeout reports that safe pause is unconfirmed; it does not kill the process or claim that recovery state exists.

The first `SIGINT` or `SIGTERM` received by the trainer invokes the same step-boundary pause flow. `SIGKILL`, power loss, kernel failure, and hardware failure cannot be acknowledged; recovery then uses the last committed periodic snapshot and may lose at most approximately five minutes of completed work.

### 9.4 Resume

The resume command names the existing run and private acknowledgement but supplies no training overrides. It performs the complete preflight and snapshot validation, acquires the exclusive run lock, restores state, records a new active interval, and continues toward the original target.

## 10. Resource policy

The overnight CPU profile remains deliberately light:

- CPU device, batch size one, deterministic algorithms, and the trainer's existing single-thread setting;
- zero DataLoader workers and no full-corpus preload;
- one volume and its logits live at a time;
- a preallocated compact loss tensor rather than an in-memory list of per-step dictionaries; and
- two overwritten snapshots rather than an accumulating checkpoint history.

The process checks its resident-set size after optimizer steps. At or above 1.5 GiB RSS it requests an internal safety pause, commits a recovery snapshot, records `memory_limit` as a metadata-safe pause reason, and releases the lock. It does not continue automatically. Existing pre-run available-memory and swap checks remain in force.

The 185,946-step budget is derived from the previously observed CPU run and retains the existing 20 percent time reserve. The monitor's ETA is advisory. Slowdown does not authorize more steps, a faster device, concurrent work, or automatic extension.

## 11. Failure and recovery policy

All behavior fails closed:

- Git, private-root, acknowledgement, source/prepared binding, sidecar, token range, split, formal Dataset, or false/zero drift stops before optimization or resume.
- Non-finite loss, gradient, optimizer state, model state, reconstruction, or progress statistic triggers the normal failure path. A last-known-good periodic snapshot remains untouched, but the run does not claim a safe pause unless a new snapshot validates.
- Snapshot corruption falls back only through the strict second-slot rule. No old run, final checkpoint, partial tensor set, or unbound file may substitute for a recovery snapshot.
- A lock conflict, control-file race, invalid transition, configuration change, code change, unknown artifact, or finalization mismatch stops the command.
- There is no automatic cleanup, retry, run-ID reuse, device fallback, target extension, evaluation, or follow-on training.
- A paused or interrupted run cannot be evaluated. Only an exact-target `completed` run may enter the existing held-out evaluator.
- Failure to pass the quality gate is a valid result and never authorizes more training automatically.

No diagnostic path prints exact loss, private names, private artifact hashes, reconstruction content, tensor content, weights, or per-case records into Codex output.

## 12. Verification strategy

Implementation follows test-driven development and uses committed synthetic fixtures only. Required tests cover:

- every legal and illegal state transition;
- exclusive locking and refusal of concurrent trainers;
- deterministic uninterrupted training versus pause/resume training, requiring identical final model state, reconstruction, and canonical metrics;
- complete model, optimizer, loss-prefix, reconstruction, random-state, configuration, code, corpus, split, Dataset, and gate snapshot validation;
- interruption injection before and after every temporary write, `fsync`, slot replace, slot validation, and pointer replace;
- pointer-slot corruption, strict fallback to the other slot, and refusal when both slots fail;
- pause polling only at step boundaries, request/acknowledgement matching, idempotent repeated requests, timeout, and signal-triggered pause;
- terminal snapshot and idempotent recovery from each possible finalization interruption without repeating the final optimizer step;
- exact one-row-per-step final metrics after one or more resumes;
- atomic metadata-safe progress updates and finite throughput/ETA handling;
- default monitor output without loss, explicit interactive loss output, and refusal to emit loss to non-interactive or redirected output;
- an injected synthetic RSS reading at the 1.5 GiB limit entering a validated pause without allocating that amount in the test process;
- exact version-two artifact inventory and unknown/temp/symlink refusal;
- unchanged version-one training and evaluator contracts for the two existing runs;
- unchanged formal Dataset hashes, Dataset v3 false/zero, normal Node generation, and M4 boundaries; and
- absence of private records or artifacts from Git and test output.

After focused tests pass, run the complete Stage 7 Python suite, the complete Node suite with the documented Node runtime and required child-process permission, and the complete private preflight. Re-run all formal hashes, gate checks, Git ignored/untracked checks, and artifact-boundary checks after implementation. No real private training is used as an implementation test.

## 13. Operational sequence after implementation

Implementation passing tests is not permission to train. The next operational sequence is:

1. Write and owner-review a durable handoff containing the exact implementation HEAD and read-only continuation commands.
2. Confirm Git clean, exact HEAD, ignored/untracked private root, full private preflight, 22 active cases, 42 untouched deferred cases, 15/7 split, formal Dataset hashes, false/zero gate, and immutable existing runs.
3. Present the fresh run ID and the fixed seed `7101`, batch size `1`, learning rate `0.001`, CPU device, 185,946 target steps, five-minute snapshots, and resource limits.
4. Wait for the owner to explicitly send `device=cpu,steps=185946` in that operational window.
5. Start only the isolated private trainer with a fresh run ID below `.local/stage7-private-research/runs/`.
6. Expose the local monitor command so the owner can watch progress and opt into local loss display.
7. On pause, wait for confirmed durable acknowledgement before reporting that shutdown is safe.
8. On exact completion, validate the version-two manifest scope/distribution, artifact inventory, finite-status booleans, checkpoint integrity, formal hashes, and gate without exposing exact private metrics or content.
9. Run the existing held-out evaluator once, inspect only aggregate completion/gate/boundary status in Codex, and stop.

## 14. Non-goals

This design does not add:

- resume support for either existing version-one run;
- checkpoint accumulation, best-checkpoint selection, validation-driven early stopping, or hyperparameter search;
- more than two rotating recovery slots or a configurable checkpoint interval;
- automatic background services, cloud tracking, uploads, remote monitoring, or exported logs;
- complete-building generation, prompt conditioning, inference export, or primary-provider integration;
- processing, tiling, cropping, or rescaling of the 42 deferred oversized buildings;
- Dataset v3 admission, M3 real-data eligibility, normal Node Python dependencies, M4 Apply Mode, or public model release; or
- authorization to begin a private run merely because this document exists.

## 15. Approval and next gates

The owner approved the cooperative file protocol, pause-at-step-boundary semantics, five-minute snapshots, fixed two-slot overwrite rotation, local opt-in loss display, 185,946-step overnight target, 1.5 GiB memory safety pause, failure policy, and verification requirements in conversation on 2026-07-16.

The next gate is owner review of this committed written specification. After that review, create a detailed TDD implementation plan. Implementation requires a separate approval and must remain sequential. A new real private run remains blocked until implementation and verification complete, a durable operational handoff is approved, all continuation checks pass, and the owner explicitly provides the device and exact positive step count again.
