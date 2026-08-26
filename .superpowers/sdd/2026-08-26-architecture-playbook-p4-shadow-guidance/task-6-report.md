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

## Fix round 1/5: no-replace races and cleanup commit boundary

- Review verification confirmed that partial backup deletion re-entered rollback, plain POSIX rename could replace empty foreign directories, a validated source could be swapped before rename, and stage chmod/write/sync lacked immediate authority rechecks.
- RED: after adding backup-unlink failure, empty final-output collision, empty backup collision, exact check-to-rename source swap, and chmod/write/sync authority-drift injections, `node test/playbookShadowStorage.test.js` reported 36 tests/subtests with 25 passing and 11 failing. The failures showed the new output missing after partial cleanup, both empty collisions overwritten, the swapped source absent instead of restored, and observable chmod/write/sync mutations after authority drift. Existing install/rollback injections also failed because the required no-replace primitive was not yet present.
- A strengthened backup-recovery assertion then produced a focused RED with `node --test --test-name-pattern="backup cleanup failure" test/playbookShadowStorage.test.js`: the installed output survived, but the backup was still missing files after the injected third unlink.
- GREEN: `node test/playbookShadowStorage.test.js` reported 36/36 passing, and `node --test test/playbookShadowStorage.test.js test/playbookShadowContracts.test.js` passed both focused files after the fixes. `npm test -- --test-reporter=dot` then completed the repository-wide suite with exit 0 when run with the child-process permission required by its git/CLI tests. `node --check` passed for storage and its test, and `git diff --check` passed.
- All install and rollback directory moves now use `/usr/bin/mv --no-clobber --no-target-directory` with the admitted run descriptor passed as child fd 3 and only validated basenames appended below `/proc/self/fd/3/`. No shell is involved, stdout/stderr are ignored, and every spawn or exit failure becomes only `SHADOW_INSTALL_FAILED`.
- Rename callers recheck the expected source inode, use no-replace destinations, verify the installed inode, and restore an unexpected moved source to its original basename without deleting it. Empty output and backup collisions remain inode-for-inode unchanged.
- Backup removal begins only after the complete new output is verified and committed. A cleanup failure never removes that output; missing old files are reconstructed exclusively from retained exact bytes inside the verified backup inode and all five files are reverified before the stable failure is returned.
- Authority is rechecked immediately before stage chmod, each write, each sync, cleanup unlink/rmdir, and every install, restoration, and rollback rename mutation.
- Portability dependency: this security boundary is intentionally Linux-specific and now additionally requires GNU `/usr/bin/mv` with `--no-clobber` and `--no-target-directory`; this was explicitly approved for the descriptor-bound implementation and adds no npm dependency.
