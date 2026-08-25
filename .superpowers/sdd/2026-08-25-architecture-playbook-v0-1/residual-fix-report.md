# Architecture Playbook v0.1 — Residual Security Fix Report

Date: 2026-08-25

## Status and baseline

The scoped residual fixes are complete and verified. Work began from the exact
clean baseline:

```text
0bc40e39caa373d88c87e5455e74ef56e72e2a78
```

The final commit identity is returned after commit; a commit cannot contain its
own hash.

## Critical: Node module factory binding propagation

The Acorn dependency audit now recognizes the default export of `node:module`
or `module` as a module namespace and recognizes `.createRequire` on a directly
loaded Node module object. These ordinary executable forms therefore propagate
to a real loader:

```js
import Module from 'node:module';
const load = Module.createRequire(import.meta.url);
```

```js
const makeLoader = require('node:module').createRequire;
const load = makeLoader(__filename);
```

Factory values hidden in an object, array, argument, or other unsupported flow
are tracked conservatively and produce `INDIRECT_LOADER_FACTORY_CALL` instead
of leaving the audit at 0/0. A directly modeled factory invocation is marked as
factory-only, not mistaken for module execution. The existing
`createRequire(...).resolve(...)` operation remains explicitly non-executing
and does not generate a false unresolved fact.

Every new bypass fixture first executed `src/construction/target.cjs` and
returned its marker value, then asserted the independent production audit
violation or unresolved result. Neighbor controls execute unrelated
`node:module` members without false positives. A separate construction target
would write an `executed.marker` at module top level; the audit resolved its
construction edge while the marker remained absent, proving that production
audit traversal does not execute audited application modules.

### Critical TDD evidence

Initial targeted RED:

```text
node --test --test-isolation=none --test-name-pattern='loader bindings|node module factory controls' test/playbookP3Gate.test.js
tests 16; pass 12; fail 4
```

The two reported executable bypasses and the executable indirect factory
container all returned audit 0/0; their parent group was the fourth failure.
All three controls passed in RED.

Targeted GREEN after the minimal binding change:

```text
tests 16; pass 16; fail 0
```

The first complete gate run then exposed one conservative self-audit false
positive: factory identity flowed through the audit's own consumed
`createRequire(...).resolve(...)` call. Treating a directly invoked factory as
consumed removed that false propagation while leaving indirect factories
blocked. The complete P3 gate then passed 45/45 with an empty baseline
`unresolved_manual_dependencies` array.

## Important: bounded percent normalization for file/UNC leakage

High-priority file/UNC scanning now normalizes printable ASCII percent escapes
before matching. Normalization is deterministic and bounded to eight rounds,
retains raw input offsets for distinct-range counting, accepts mixed case and
partial encoding, and recognizes repeated encoding. It never calls a throwing
URI decoder. Invalid or incomplete escapes remain literal. If decodable input
still remains when the fixed budget is exhausted, the audit records a leak and
blocks rather than failing open.

The normalized high-priority ranges are appended before public HTTPS
exceptions. Consequently both reported strings are blocked even if placed
inside otherwise public content:

```text
f%69le:%2F%2F%2Fhome%2Falice%2Fsecret.txt
%5C\server\share\secret.txt
```

Pure-audit controls retain leak count 0 for a normal HTTPS URL, ordinary prose,
malformed percent text, a percent-encoded public HTTPS URL, and ordinary
percent literals.

### Important TDD evidence

Focused compiler plus checked-snapshot RED:

```text
node --test --test-isolation=none test/playbookV01Compiler.test.js test/playbookP3Gate.test.js
tests 65; pass 60; fail 5
```

The pure compiler behavior test failed, as did the three new protected-snapshot
subtests and their parent. After the bounded normalization implementation, the
identical command passed 65/65.

## Final verification

Exact focused playbook/CLI gate through the permitted Git and nested-process
path:

```text
node --test test/playbook*.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js test/architecturePlaybookManualCli.test.js
tests 221; pass 221; fail 0
```

Managed artifact check:

```text
npm run playbook:manual -- check
playbook_status=current
reviewed_rule_count=21
core_procedure_count=15
case_pattern_count=6
artifact_count=5
managed_artifact_drift_count=0
```

Full regression with a compact TAP reporter:

```text
npm test -- --test-reporter=tap
tests 645; pass 645; fail 0
```

No test was skipped, removed, or weakened. Git and nested CLI tests used the
permitted real-subprocess path, matching the documented sandbox distinction.

## Preserved scope and self-review

- P3 remains 21 cards with 15 core procedures and 6 case patterns.
- Candidate/advisory/not-tested maturity, P2 lineage, one conflict, seven
  unknowns, and zero runtime authority are unchanged.
- All five generated artifacts remain byte-current and were not rewritten.
- No construction, runtime pipeline, index, or resource-registry file changed.
- Descriptor/no-follow checking, rollback behavior, and checked Git snapshot
  binding are unchanged.
- P3 has not generated or visually improved a house and provides zero runtime
  authority.

## Concerns

No open correctness concern remains. Percent normalization intentionally
blocks on budget exhaustion; this may conservatively reject extremely nested
percent text, but it cannot open P4 without proving the content safe.

## Principled hardening round

### Baseline and scope

This round began from the requested clean commit:

```text
bba02f9a96de9a422a6309fbdd51c1dfdbd20bdc
```

Only the manual dependency audit, public-leak range scanner, and their P3/pure
compiler tests changed. No construction module, runtime pipeline,
resource-registry file, managed artifact, admission policy, or public P3 claim
was modified.

### Scope-aware loader/factory analysis

The previous global name sets were replaced by one Acorn-based lexical scope
index and a fixed-point taint analysis. Bindings are resolved through program,
function, block, catch, loop, and switch scopes. Default/namespace
`node:module` bindings, `createRequire` factories, created loaders, and opaque
factory/loader escapes are distinct states. Direct modeled loaders still add
real CJS dependency edges. Unsupported computed access, unknown calls,
returns, exports, containers, destructuring, and inter-module escapes now add
stable unresolved facts instead of leaving the audit at 0/0.

The executable regression fixtures cover:

- `import { default as Module } from 'node:module'`;
- dynamic `Module[key]` factory access and dynamic destructuring;
- a function returning the factory;
- ESM named/default factory re-exports and a namespace re-export;
- CJS `module.exports` and `exports.member` factory exports;
- nested real bindings plus shadowed parameter, local, and `require` controls.

Every malicious fixture separately executes its construction target and
observes the marker value before invoking the production audit. The existing
non-execution fixture still proves that the audit resolves a target without
executing its module body. `Module.isBuiltin(...)`, the unrelated CJS member
control, and exact loader `.resolve(...)` remain 0/0.

Initial dependency RED, before production changes:

```text
node --test --test-isolation=none --test-name-pattern='loader bindings|loader factories cannot escape|loader taint follows lexical scope' test/playbookP3Gate.test.js
tests 27; pass 14; fail 13
```

The same command after the scope-aware implementation passed 27/27. An
additional policy-boundary RED for dynamic factory destructuring and a Node
module namespace re-export reported 23 tests, 19 pass, 4 fail (the two cases
and their parents); the same command then passed 23/23. The obsolete name-set
scanner was removed rather than retained as a weaker second result.

### Unified normalized leak ranges

Percent normalization now supplies both HTTPS exemption ranges and all leak
matcher ranges, preserving their raw input offsets. File URL matching accepts
one or more slash characters, which covers canonical `file:/`, `file://`, and
`file:///` forms and their mixed/partial encoded equivalents. High-priority
file and UNC matches are added before HTTPS filtering, so an embedded file URL
or UNC reference remains a leak; an ordinary absolute path inside a partially
encoded public HTTPS URL remains exempt. The existing eight-round decoding
budget, exhaustion blocker, malformed-input behavior, overlap merging, and
range deduplication remain deterministic and fail closed.

Leak RED across the pure compiler and descriptor-protected checked snapshot:

```text
node --test --test-isolation=none --test-name-pattern='pure audit blocks file URLs|protected checked snapshot blocks file URL' test/playbookV01Compiler.test.js test/playbookP3Gate.test.js
tests 12; pass 6; fail 6
```

The failures were the one-slash and partial file URL misses, the embedded
partial-HTTPS file miss, the partial-HTTPS ordinary-path false positive, and
their parent tests. The identical command passed 12/12 after using the unified
normalized range mapping.

### Final verification for this round

Changed suites:

```text
node --test --test-isolation=none test/playbookV01Compiler.test.js test/playbookP3Gate.test.js
tests 87; pass 87; fail 0
```

Exact focused playbook/CLI gate through the permitted real-subprocess path:

```text
node --test test/playbook*.test.js test/architecturePlaybookCourseCli.test.js test/architecturePlaybookEvidenceCli.test.js test/architecturePlaybookManualCli.test.js
tests 243; pass 243; fail 0
```

The same focused command inside the restricted subprocess sandbox completed
19 files and failed only the manual CLI file because its first nested build
captured empty stdout after successfully writing the fixture artifacts. No
assertion was weakened: the required permitted path produced the authoritative
243/243 result.

Managed artifact verification:

```text
npm run playbook:manual -- check
playbook_status=current
reviewed_rule_count=21
core_procedure_count=15
case_pattern_count=6
artifact_count=5
managed_artifact_drift_count=0
```

Full regression through the permitted real-subprocess path:

```text
npm test
tests 667; pass 667; fail 0
```

### Preserved claims and residual risk

P3 remains exactly 21 cards (15 core procedures and 6 case patterns), one
conflict, seven unknowns, advisory/candidate/not-tested maturity, P2 lineage,
five byte-current managed artifacts, and zero runtime authority. P3 has not
generated or visually improved a house and provides zero runtime authority.

The dependency analysis deliberately blocks opaque factory/loader flows that
it cannot prove safe. This can reject unusual metaprogramming in the manual
module tree, but it cannot silently open P4. No open scoped correctness concern
remains.
