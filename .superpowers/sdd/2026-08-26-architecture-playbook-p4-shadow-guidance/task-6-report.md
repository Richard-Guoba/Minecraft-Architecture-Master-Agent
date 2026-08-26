# Task 6 report: safe admission and owned atomic shadow storage

## Delivered

- `admitShadowRun()` resolves a strict descendant of the project `out/` directory, rejects every symlinked project/out/run/blueprint component, and walks directories through retained descriptors with `O_DIRECTORY | O_NOFOLLOW`.
- The admitted authority retains project, out, and run device/inode identities, rechecks both open descriptors and their descriptor-relative names before mutations, returns exact blueprint bytes, and closes idempotently.
- `installShadowArtifacts()` accepts exactly the five fixed output keys, validates the incoming manifest and four body hashes, and refuses any existing output that has extra/missing entries, a corrupt or drifting manifest, symlinks, non-files, or body-hash drift.
- New artifacts are written as exclusive `O_NOFOLLOW` files in a private `0700` sibling stage and re-read through descriptors before install.
- Owned replacement uses a verified backup. Failed writes and installs remove only the generated, inode-matched stage/new directory and restore the exact old output; rollback failure is sanitized as `SHADOW_INSTALL_FAILED` and leaves the verified backup recoverable.
- Identical owned output returns `unchanged` without replacing directory or file inodes. Create and replace touch no unrelated run bytes.

## Contract scope extension

Task 6 ownership required the spec-authoritative `manifest.artifact_hashes` field, while the Task 1 contract still accepted `file_sha256`. The parent explicitly authorized the minimum shared-contract migration in this task. `validateManifest()` and its fixture now require `artifact_hashes` with exactly the four non-manifest files and reject `file_sha256`; no compatibility alias remains.

## TDD evidence

- RED contract: `node test/playbookShadowContracts.test.js` reported 8 passing and 1 failing test because the valid `artifact_hashes` fixture was rejected as `SHADOW_OUTPUT_OWNERSHIP: manifest-fields`.
- GREEN contract: `node --test test/playbookShadowContracts.test.js` passed after the exact field migration.
- RED storage: `node --test test/playbookShadowStorage.test.js` failed with `ERR_MODULE_NOT_FOUND` for `src/playbook/shadow/storage.js`.
- The first storage GREEN run exposed three real test failures. Investigation showed Linux returns `ENOTDIR` for an `O_DIRECTORY | O_NOFOLLOW` symlink race, and two injection helpers incorrectly matched raw path parents instead of resolving descriptor parents. The implementation now rechecks `ENOTDIR` races, and the tests inject at the real descriptor boundary.
- Focused verification: `node --test test/playbookShadowContracts.test.js test/playbookShadowStorage.test.js` passed both test files. The storage file covers 28 tests/subtests, including admission races, output and target symlinks, stage collision, third-write failure, post-backup failure, rollback failure, late unowned collision, create, replace, and inode-preserving unchanged output.
- `node --check` passed for the storage module and test; `git diff --check` passed.
- The sandboxed full suite passed 116/126 files and the 10 failures were all child-process `EPERM` restrictions. The permitted rerun `npm test -- --test-reporter=dot` completed successfully.

## Scope and concerns

- The implementation imports only Node standard-library modules and existing `src/playbook/shadow/` helpers. It uses no recursive production deletion and no force path.
- `/proc/self/fd` is intentionally Linux-specific because descriptor-relative walking is an explicit task requirement.
- If rollback itself is injected to fail, the output name may be absent while the verified backup remains under its generated sibling name; the public error remains exactly `SHADOW_INSTALL_FAILED` with no injected or OS text.
