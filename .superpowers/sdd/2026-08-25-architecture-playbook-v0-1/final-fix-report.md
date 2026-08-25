# Architecture Playbook v0.1 — Final Concentrated Fix Report

Date: 2026-08-25

## Status and baseline

Complete and ready to commit. Work started from the required baseline:

```text
25f8e67a7c8d5a003cdfb1cec6f14dc93a1e954b
```

The baseline did not move while the fix was in progress. The final commit hash
is reported by the controller after commit because a commit cannot contain its
own identity.

## Findings closed

### 1. Binding-aware JavaScript dependency boundary

The Acorn AST audit now propagates `require` aliases and loaders returned by
ESM or CommonJS `createRequire`. It models direct calls, `module.require`,
`.call`, literal `.apply`, sequence expressions, `.bind`, and the non-executing
`require.resolve` operation. Computed module methods, loader values hidden in
objects or arrays, unsupported indirect calls, computed specifiers, and `eval`
fail closed with stable unresolved facts.

Behavioral fixtures first execute the target construction module and then
prove that the audit either resolves the construction violation or blocks the
unprovable edge. They cover ESM and CommonJS `createRequire`, require aliases,
`.call`, sequence calls, computed module methods, computed loader containers,
and eval. The production audit parses and resolves modules but never executes
the audited application modules.

The existing Node-aware graph behavior remains intact: ESM import/re-export
and dynamic import use `import-meta-resolve` `4.2.0`; CJS uses
`createRequire(importer).resolve`; every filesystem node is realpathed; package
imports, self-references, bare packages, `.mjs`, `.cjs`, cycles, and symlinks
are covered. Acorn remains pinned at `8.15.0`; no dependency version changed in
this fix.

### 2. One captured Git snapshot binds inputs and outputs

The checked-in audit captures one commit identity and validates a fixed
allowlist of 12 P2 input/admission paths plus the five managed outputs against
that commit tree. Every entry must be a regular Git blob. Stage-zero index
mode/OID mismatches, missing checked inputs, staged divergence, unstaged input
divergence, descriptor-read output divergence, non-blob paths, and Git command
failure block the gate with stable relative facts.

Compilation no longer reads P2 inputs or admission from the mutable worktree.
`loadP2PublicCorpus` accepts an optional `readFile` dependency with its existing
filesystem default; the checked-in audit injects a fixed commit-blob reader.
This small loader change is required so validation and compilation consume the
captured bytes rather than reopening ordinary paths.

Managed output drift, leak scanning, and commit comparison use the same frozen
UTF-8 strings returned by the descriptor/no-follow checker. No checked-in audit
path writes or repairs files. Git errors are caught and returned as one frozen
blocked audit without stderr, absolute paths, or raw exception messages.

### 3. File URL and UNC leakage

Literal and percent-encoded `file:` URLs and UNC references are high-priority
leak ranges. They are counted before public HTTPS range exceptions, including
when embedded in an HTTPS query. Existing public-URL behavior and ordinary
private path detection remain covered.

### 4. Node 20 compatibility

The manual CLI now derives its own directory with:

```js
path.dirname(fileURLToPath(import.meta.url))
```

It no longer depends on `import.meta.dirname`, which is unavailable on early
Node 20 releases allowed by `engines.node >=20`.

### 5. Public report scope fact

The seven-path pre-commit status statement is explicitly labeled as historical
evidence from the first repair round and no longer claims to describe the final
branch scope. A factual assertion protects that wording and retains the exact
no-house, no-visual-improvement, zero-runtime-authority statement.

## Strict TDD evidence

- Loader aliases and indirect calls: initial isolated RED was 21/28, with all
  six new execution-proven subcases plus their parent failing; the first GREEN
  was 28/28.
- Git snapshot binding: RED was 28/32 for staged input, unstaged input,
  descriptor output, and non-blob behavior; GREEN was 32/32.
- File URL and UNC leakage: combined RED was 48/52; GREEN was 52/52.
- Node 20 compatibility: the new static assertion failed on
  `import.meta.dirname`. The default sandbox also suppressed the unrelated
  nested CLI stdout, so that run was 21/23. After the production change, the
  unchanged suite passed 23/23 on the permitted subprocess path.
- Public report fact: RED was 35/36; GREEN was 36/36.
- Final self-review added CommonJS `createRequire` destructuring and an object
  computed-loader fixture. Their targeted RED was 6/9 (two subtests and the
  parent failed); GREEN was 9/9. A combined run then exposed a conservative
  false positive for the audit's own `require.resolve`; modeling that operation
  as resolution-only restored the full P3 gate to 38/38 without weakening the
  indirect-loader blockers.

No assertion was removed, skipped, or weakened.

## Final verification

Exact focused command on the permitted nested-subprocess/Git path:

```text
node --test test/playbook*.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js test/architecturePlaybookManualCli.test.js
tests 211; pass 211; fail 0
```

Managed artifact check:

```text
npm run playbook:manual -- check
playbook_status=current
artifact_count=5
managed_artifact_drift_count=0
```

Full regression on the same permitted path:

```text
npm test
tests 635; pass 635; fail 0
```

Completion checks before staging:

- `git diff --check`: exit 0, silent.
- `git ls-files .local/architecture-playbook`: exit 0, silent.
- `git status --short`: only the intended implementation, tests, and report
  paths were present.

The default managed sandbox injects `ELECTRON_RUN_AS_NODE=1` into Node test
workers, which suppresses the nested manual CLI entrypoint's output. CLI and
Git subprocess suites were therefore run through the explicitly permitted real
subprocess path. Assertions were unchanged.

## Preserved boundaries and self-review

- P3 still contains exactly 21 cards: 15 `core-procedure` and 6
  `case-pattern`.
- Knowledge status remains candidate/advisory/not-tested; P2 lineage, one
  conflict, seven unknowns, 15 resolved terms, five unresolved groups, and
  nine zero-authority coverage rows are unchanged.
- All five generated artifacts remain byte-current; no generated artifact was
  rewritten.
- No construction module, runtime pipeline, or index entry was modified or
  imported by P3.
- Descriptor/no-follow and rollback architecture, plus resource-registry
  isolation, remain unchanged.
- P3 has not generated or visually improved a house and provides zero runtime
  authority.

## Concerns

No open correctness concern remains. The checked-in audit intentionally needs
a Git executable, a real worktree, and the existing Linux descriptor-backed
managed checker; inability to prove those facts returns a stable blocked gate
rather than opening P4.
