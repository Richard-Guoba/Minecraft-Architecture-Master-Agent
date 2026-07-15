# Stage 7 Private-Research Quality Evaluation and Time-Budgeted Training Design

**Date:** 2026-07-15

**Status:** approved for planning; not authorization to implement or start training

**Extends:** `2026-07-15-stage-7-private-research-pretraining-isolation-design.md`

## 1. Purpose

The prepared Stage 7 private-research corpus is ready for an initial local experiment, but the existing trainer records only training-set masked reconstruction loss. That signal can prove that optimization ran; it cannot support a held-out quality claim.

This design adds a contained, deterministic evaluation path and a resource-bounded operating protocol. Its first quality question is deliberately narrow:

> Does the trained masked voxel autoencoder reconstruct hidden non-air material-family voxels on the seven held-out private-research buildings better than an untrained model and a training-set class-prior baseline?

The answer is local evidence about one small held-out masked-reconstruction task. It is not evidence of complete-building generation, prompt following, architectural usefulness, broad generalization, Dataset v3 readiness, or M4 suitability.

## 2. Immutable boundaries

All boundaries from the existing private-research isolation design remain in force. In particular:

- Private sources, prepared volumes, exact metrics, reconstructions, checkpoints, weights, hashes, and generated outputs remain below `.local/stage7-private-research/` and are never pushed, published, uploaded, shared, packaged, or exported.
- Dataset v1, v2, and v3 files remain byte-for-byte unchanged. Dataset v3 remains `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- The private corpus remains separate from Dataset v3, M3 fixture and real-data paths, normal Node generation, the primary provider, and M4 Apply Mode.
- The 42 deferred oversized sources remain untouched. This work adds no tiling, cropping, rescaling, or oversized-building processing.
- Normal Node generation remains Python-independent.
- Every private training run requires a fresh, explicitly approved device and positive step budget. A wall-clock window is converted into a proposed step count, not treated as permission by itself.
- Work remains sequential. No parallel agents or concurrent private runs are used.

Exact metric values stay in ignored local artifacts. Interactive output may report only completion status, safety metadata, whether the quality gate passed, and whether formal boundaries remained unchanged.

## 3. Approaches considered

### A. Separate post-training evaluator with staged CPU runs — selected

Keep optimization and evaluation as separate commands. The existing private trainer produces its checkpoint, then a new isolated evaluator loads that checkpoint, evaluates deterministic masks, compares two baselines, and writes one aggregate local report.

This keeps validation logic out of the training loop, avoids validation-set influence on optimization, limits memory use, and preserves a small failure surface. The trade-off is that the first version has no validation-driven early stopping or mid-run quality feedback.

### B. Inline periodic validation and early stopping — rejected for the first run

This could stop a long run when held-out quality stops improving. It would also couple validation to optimization, add checkpoint-selection semantics, increase implementation and recovery complexity, and invite repeated decisions based on only seven held-out cases.

### C. Overnight training followed only by training-loss inspection — rejected

This requires no new evaluator, but it cannot answer the approved quality question and would make an overfitting run look successful.

## 4. Evaluation command boundary

Add a separately named private command equivalent to:

```text
npm run evaluate:stage7:private-research -- \
  --root .local/stage7-private-research \
  --run-id cpu-quality-run \
  --private-research-only \
  --seed 7101 \
  --mask-repeats 5 \
  --mask-ratio 0.25 \
  --device cpu \
  --metadata-only
```

The command must:

1. require the explicit private-research acknowledgement flag;
2. run the complete private preflight before reading a checkpoint and after writing its report;
3. resolve the selected run strictly below the ignored private `runs/` directory;
4. refuse symbolic links, tracked paths, path escapes, missing artifacts, and an existing evaluation report;
5. validate checkpoint manifest scope, distribution, private marker, configuration, input-manifest hash, split hash, filename, and checkpoint SHA-256 against current local state;
6. load tensors on CPU with a weights-only checkpoint path, require the exact expected state-dict keys and shapes, and reject non-finite or non-floating weights;
7. evaluate without gradients, one volume at a time, and avoid retaining full logits after each accumulator update; and
8. write exactly one aggregate `evaluation.json` inside the selected run directory after all checks and evaluations succeed.

The trainer gains a metadata-only output mode for operational runs. In that mode it must not print loss values. The evaluator likewise prints no numeric quality metrics. Existing private metric files remain local and unchanged in purpose.

## 5. Deterministic held-out protocol

The prepared split remains authoritative: 15 cases are training cases and seven are validation cases. The evaluator must never optimize on, estimate priors from, or select a checkpoint using the validation cases.

For each validation case, the evaluator creates five independent deterministic masks at ratio `0.25`. Evaluation mask seeds are derived from a versioned evaluation namespace, the approved seed, the stable validation-list position, and the repeat index. They do not depend on filenames and are not written to interactive output.

This produces 35 forward evaluations. Metrics use masked positions only. The evaluator fails closed if any mask is empty, a validation case is missing, a tensor violates the `64 x 64 x 64` categorical contract, a token is outside `0..8`, or the complete 35-evaluation set is not processed.

Token `0` is air. Primary non-air metrics cover tokens `1..8` that have positive masked target support across the complete validation evaluation. A run fails evaluation if no non-air class has positive support.

## 6. Metrics and baselines

The primary metrics are:

- macro F1 over supported non-air classes; and
- macro intersection-over-union over supported non-air classes.

The evaluator also records local-only aggregate masked cross-entropy, overall masked accuracy, class supports, and a confusion matrix. Per-case identifiers, filenames, source URLs, raw content, voxel samples, and per-case records are not included in the report.

Two deterministic baselines use exactly the same 35 masks:

1. **Untrained architecture baseline:** a newly initialized model with the same architecture and approved seed, without optimizer updates.
2. **Training-set class-prior baseline:** token frequencies estimated only from the 15 training volumes. Cross-entropy uses finite add-one-smoothed probabilities; categorical predictions use the highest-probability token.

The trained model passes the first quality gate only if both its non-air macro F1 and its non-air macro IoU are strictly greater than the corresponding value from each baseline. All trained-model and baseline metrics must be finite.

The gate is intentionally relative. No absolute quality threshold is claimed from seven held-out cases. The permitted conclusion is limited to:

> The trained model did or did not outperform both approved baselines on the fixed small held-out masked-reconstruction protocol.

## 7. Aggregate evaluation artifact

`evaluation.json` is a prohibited-distribution, private-research-only artifact. It records enough local metadata to reproduce and audit the evaluation without embedding private records:

- schema and evaluator version;
- `training_scope: "private-research-only"`;
- `distribution: "prohibited"`;
- checkpoint filename and SHA-256;
- current prepared-manifest and split SHA-256 values;
- model architecture identifier;
- device, approved seed, mask ratio, repeat count, and evaluated-case count;
- aggregate trained-model metrics and the two aggregate baseline metric groups;
- supported-class count and aggregate class supports;
- aggregate confusion matrices;
- finite/completeness checks;
- the two primary comparison booleans and overall quality-gate result; and
- the formal Dataset v1/v2/v3 hashes and Dataset v3 false/zero values observed after evaluation.

The file contains no timestamp, hostname, absolute path, private filename, case ID, source URL, reconstruction bytes, model tensors, or per-case metric row.

## 8. Resource-bounded operating protocol

The first operational device is CPU. Training uses seed `7101`, batch size `1`, learning rate `0.001`, deterministic algorithms, and the trainer's single-thread configuration.

### 8.1 Five-step calibration

Before an overnight run, execute one fresh five-step calibration run after the owner explicitly approves `device=cpu` and `steps=5`. Measure elapsed wall-clock time and maximum resident memory with the operating system. Before starting, require at least 8 GiB of currently available memory.

The calibration is unacceptable if:

- maximum resident memory exceeds 2 GiB;
- available memory is below 8 GiB at the pre-run check;
- the system measurement reports any process swap operation, or the command is killed or returns nonzero;
- any loss, gradient, checkpoint tensor, or metric is non-finite;
- an artifact escapes the private run directory; or
- a private or formal Dataset invariant changes.

Calibration artifacts remain in their fresh private run directory. They are not reused, overwritten, deleted automatically, evaluated as the overnight candidate, or presented as model-quality evidence.

### 8.2 Converting a time window into steps

For each substantive run, the owner supplies a local start/end window. Let `W` be the window length in seconds and `S` be the measured calibration wall-clock seconds divided by five. The proposed step budget is:

```text
floor(0.80 * W / S)
```

The 20 percent reserve covers preflight, checkpoint writing, post-run evaluation, and ordinary performance variation. The estimate is conservative because calibration startup and preflight time are included in `S`.

Before training, present the proposed fresh run ID, device, positive steps, batch size, learning rate, seed, code revision, measured calibration duration, measured peak memory, time window, and expected finish time. Training begins only after the owner explicitly confirms the device and exact positive step count in that window.

## 9. Run sequence

Every calibration or substantive run follows this order:

1. Confirm the repository status and the owner-approved code revision.
2. After implementation verification, create and owner-review a new durable training-run handoff that records the exact approved implementation HEAD. Run its complete read-only continuation checks before every operational run.
3. Resolve any Git drift before proceeding. The current candidate revision may be accepted for planning only after confirming that its difference from the prior handoff's recorded predecessor is the prior handoff document itself plus subsequently owner-approved design or implementation commits. Training requires an exact match to the new training-run handoff.
4. Verify private-root containment, ignored/untracked status, acknowledgement, source and prepared hashes, sidecars, token bounds, split uniqueness, expected counts, empty/fresh run ID, formal Dataset hashes, and Dataset v3 false/zero.
5. Check current available memory and the approved time/step budget.
6. Run only the isolated private trainer in metadata-only output mode.
7. Audit run containment, manifest private scope and prohibited distribution, finite local metrics, and checkpoint integrity without reading private content into interactive output. A completed trainer run has exactly `metrics.jsonl`, `reconstruction.bin`, `checkpoint.pt`, and `checkpoint_manifest.json`; a successfully evaluated substantive run adds exactly `evaluation.json`.
8. For a substantive run, run the isolated evaluator and inspect only its completion, pass/fail, and boundary booleans interactively.
9. Re-run formal Dataset hashes and the Dataset v3 gate.
10. Stop. Do not automatically launch another run based on the result.

## 10. Failure and recovery

All checks fail closed. No automatic cleanup, retry, step extension, fallback device, or run-ID reuse is allowed.

- Preflight or boundary drift stops before training.
- A configuration, CUDA, memory, non-finite, checkpoint, evaluation, containment, or formal Dataset error stops the current sequence.
- An interrupted trainer may leave an empty or partial run directory. Preserve it for diagnosis and use a new run ID only after owner approval.
- The first version has no resume semantics or periodic checkpoints. Adding either requires a separate design because it changes artifact and optimizer-state contracts.
- Failure to beat a baseline is a valid research result, not permission to train longer automatically.
- Exact local metrics and failed reconstructions remain private even when diagnosing a failure.

## 11. Verification strategy

Implementation follows test-driven development using committed synthetic fixtures only. Tests must cover:

- deterministic mask derivation and exactly five masks per validation case;
- masked-only confusion counts, cross-entropy, accuracy, supported-class selection, non-air macro F1, and non-air macro IoU;
- strict dual-baseline gate behavior, including ties and absent classes;
- training-only class-prior estimation and add-one smoothing;
- deterministic untrained-model initialization;
- safe checkpoint manifest, checksum, state-dict, shape, dtype, and finite-weight validation;
- private-root and run-directory containment, ignored/untracked checks, symlink and path-escape rejection;
- refusal to overwrite `evaluation.json`;
- aggregate-only output with no case IDs, filenames, URLs, absolute paths, tensors, or per-case rows;
- metadata-only trainer and evaluator stdout with no numeric private metrics;
- unchanged formal Dataset hashes and Dataset v3 false/zero before and after evaluation; and
- evaluator failure without a complete 35-evaluation result.

Run the focused evaluation tests, the complete Stage 7 Python suite, and the relevant existing Node boundary tests. No real private record or artifact enters test output or Git.

## 12. Non-goals

This design does not add:

- complete-building generation or unconditional sampling;
- prompt conditioning, semantic plan generation, inference export, or architectural utility scoring;
- human preference or aesthetic evaluation;
- validation-driven checkpoint selection, early stopping, resume, or periodic checkpoints;
- hyperparameter search or concurrent experiments;
- tiling, cropping, scaling, or support for the deferred oversized buildings;
- Dataset v3 admission, M3 real-data eligibility, M4 Apply Mode, or a primary provider; or
- any permission to publish or share private artifacts or numeric metrics.

## 13. Approval and next gates

The owner approved the CPU, batch-one, deterministic, time-budgeted approach; the five-repeat held-out protocol; non-air macro F1 and IoU; the strict dual-baseline gate; aggregate-only local reporting; and the failure-recovery policy in conversation on 2026-07-15.

The next gate is owner review of this written specification. After that review, create a detailed TDD implementation plan. Implementation and verification require a separate approval. A real private training command remains blocked until implementation passes its tests, the complete continuation preflight succeeds, and the owner explicitly confirms a device and exact positive step count for that run.
