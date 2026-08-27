# Task 8 implementation report

## RED

- Added `test/playbookExecuteReplay.test.js` before production replay code.
- First run: `node --test --test-isolation=none test/playbookExecuteReplay.test.js` failed with `ERR_MODULE_NOT_FOUND` for `src/playbook/execute/replay.js`, exactly as required.
- After the minimal exported placeholder, the real massing replay, determinism, rollback, and context-injection fixtures all failed on `not-implemented` before behavior was added.

## GREEN

- Implemented targeted massing/structure replay from checkpoint-bound recipe payloads.
- Preserves upstream checkpoint envelopes byte-for-byte and rebuilds a contiguous target/downstream suffix with revision `+1` and exact parent/transaction origins.
- Applies only complete Task 7 resolved operations at their owned layer; naked effects remain invalid.
- Recompiles through the provider-free production `compilePreparedConstruction` seam with `world`, `datapacksDir`, and `minecraftDir` explicitly undefined.
- Runs `BlueprintQAAgent`, deterministic P4 review over the exact regenerated `blueprint.json` bytes, and score-free eligibility with repair budget `1`.
- Added exact request/result/failure evidence validators and storage cross-hash checks. The facade checkpoint binds the result hash.
- Added an identity-checked, no-replace failure-evidence append. The complete read-only failure directory is staged outside the candidate and attached atomically, so partial write/sync failures cannot modify the current candidate generation.
- Extended candidate storage only for the four fixed Task 8 evidence paths; unknown auxiliary paths remain rejected.

## Verification

- Prescribed focused command (replay, design stages, storage, repair transaction), final fresh run with dot reporter: exit `0`, 228 tests represented by the suite.
- P5/P4 focused regressions (`checkpoints`, `eligibility`, shadow run/gate/contracts plus replay/design/repair): 82/82 passed, exit `0`.
- `git diff --check`: exit `0`.
- A real downstream replay smoke test passes without provider or world/datapack installation.
- Cross-root production replay pins identical checkpoint, chain, exact blueprint, operation, build-function, and datapack-tree hashes.

## Files

- Created `src/playbook/execute/replay.js`.
- Created `test/playbookExecuteReplay.test.js`.
- Modified `src/construction/designStages.js`.
- Modified `src/playbook/execute/contracts.js`.
- Modified `src/playbook/execute/storage.js`.
- Modified `src/playbook/execute/storageValidation.js` (narrow storage support required by the Task 8 ruling).
- Modified `test/constructionDesignStages.test.js`.

## Decisions and concerns

- `prepared_design` and `initial_result` are accepted only as runtime values and are never added to snapshot files.
- Replay prompt authority comes from the accepted brief recipe, while architecture/topology/build inputs come from the validated frozen generator context.
- A replay that compiles successfully but remains hard-QA-invalid or playbook-ineligible is still stored once as complete evidence and is not retried.
- Full repository `npm test` was not run by this implementer; the controller should run the whole-branch gate after review, as planned.

## Review fix round 1

### RED

- Reproduced four authority gaps before implementation: missing facade artifact hashes, an omitted executable violation, an executable operation for a satisfied rule, and a locally valid variant that drifted the frozen preference.
- Replaced the filtered structure transaction fixture after canonical transaction rebuilding correctly rejected it. The replacement starts from `medieval-positive.json`, removes only `structure.load_paths`, and produces one authoritative `visible-load-path` violation and one structure repair operation.
- Reproduced a post-hashing mutation window: mutating either the returned blueprint object or exact blueprint bytes at the hashing boundary was accepted before the second exact read was added.

### GREEN

- Replay rebuilds the canonical Task 7 transaction from the accepted chain, checkpoint envelopes, authoritative P4 review, and frozen design. Supplied transaction bytes and hash must match exactly before compilation or storage.
- Added an asynchronous layer replay seam. Each actual target/downstream compile and each owned-layer applicator call is independently injectable at its real execution boundary; the earlier synthetic storage preflight markers were removed.
- Added canonical replay artifact authority: the operation list hashes canonical `blueprint.operations`, the build function hashes exact bytes, and the datapack tree hashes sorted candidate-relative POSIX `{path, sha256}` rows. Descriptor identity checks reject symlinks, non-regular entries, unsafe paths, and swaps. The facade checkpoint persists the three exact hashes plus the layer and repair-result hashes.
- Rechecks exact blueprint object/file equality immediately after the hashing boundary before accepting artifact authority.
- Failure evidence is not committed until candidate and candidates-parent directory syncs and exact post-attach inspection succeed. Every precommit fault reverses the identity-owned attachment; cleanup faults leave only a generated sibling, and identity-swapped foreign bytes are preserved.
- Replay storage integration now faults real `installCandidateSnapshot` operations: exclusive write, chmod, file sync, directory sync, current-pointer write, backup rename, and final rename preserve the old current bytes, inode, and hash. Backup retirement failure is postcommit and keeps the new replay generation authoritative.
- Storage rejects missing, extra, and malformed facade artifact authority keys without weakening generic Task 5 admission.

### Fix verification

- Fresh replay suite: 16/16 passed.
- Final prescribed replay/design-stage/storage/repair-transaction gate: 248/248 passed, exit `0`.
- Relevant P4/P5 regression gate: 184/184 passed.
- Direct failure append matrix covers nine injected write/sync/move/inspection boundaries, rollback cleanup failure, and post-attach file identity swap.
- No ledger files were edited and no Task 9 work was started.
