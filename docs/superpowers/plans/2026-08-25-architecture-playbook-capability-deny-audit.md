# Playbook Capability-Deny Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fail-open JavaScript loader taint analysis with a conservative static-capability deny gate, and make public-path leakage checks operate on one bounded normalized text model.

**Architecture:** The dependency gate will recognize only literal static module edges and reject loader capabilities at their source; it will not propagate loader values through arbitrary JavaScript. The leak gate will percent-normalize once into a mapped view, derive both high-priority file/UNC ranges and HTTPS exception ranges from that view, then map findings back to stable raw intervals.

**Tech Stack:** Node.js `>=20`, ECMAScript modules, Acorn `8.15.0`, `import-meta-resolve` `4.2.0`, Node test runner, Git-backed checked-in audit.

**Spec:** `docs/superpowers/specs/2026-08-25-architecture-playbook-capability-deny-audit-design.md`

## Global Constraints

- Preserve exactly 21 reviewed cards, 15 `core-procedure`, 6 `case-pattern`, `authority: advisory`, `maturity: candidate`, `effect_validation_status: not-tested`, and nine runtime layers with `runtime_authority: none`.
- Preserve the five managed playbook artifact paths and their checked-in bytes unless a test proves a report-only factual correction is necessary.
- Do not modify `src/construction/`, runtime generation, resource registry, template integration, or production building behavior.
- The dependency audit must not execute audited modules or perform network access.
- Any unsupported loader capability must produce a stable unresolved fact; it must never return audit `0/0` after an execution fixture reaches construction code.
- The only `createRequire` exception is the exact resolver expression in the physical audit implementation file.
- Public leak detection uses at most eight ASCII `%HH` normalization rounds; remaining decodable escapes fail closed.
- Implement from current branch history without resetting or rewriting the existing `ee4cbf6` hardening commit.

---

## File Structure

- Modify `src/playbook/manual/manualDependencyBoundary.js`: keep the public audit contract and resolver, replace taint/fixed-point inference with lexical binding lookup, static-edge collection, denied-capability collection, and a structural self-audit exception.
- Modify `src/playbook/manual/playbookV01Compiler.js`: replace split raw/normalized leak matching with one mapped normalized range pipeline.
- Modify `test/playbookP3Gate.test.js`: convert the accumulated loader fixtures into capability-deny acceptance tests and add self-exception mutation tests.
- Modify `test/playbookV01Compiler.test.js`: add pure leak range/count behavior tests.
- Modify `.superpowers/sdd/2026-08-25-architecture-playbook-v0-1/residual-fix-report.md`: append the architectural replacement and final RED/GREEN evidence; this report remains plan evidence, not a managed playbook artifact.
- Do not create another general-purpose parser or taint subsystem.

---

### Task 1: Define the Static Capability Language

**Files:**
- Modify: `test/playbookP3Gate.test.js`
- Modify: `src/playbook/manual/manualDependencyBoundary.js`

**Interfaces:**
- Consumes: `auditManualDependencyBoundary({ projectRoot: string })` and the existing temporary project fixture helpers.
- Produces: internal `scanModuleDependencies({ source, extension, modulePath, auditImplementationPath }) -> { dependencies, unresolvedCodes }`; public audit result fields remain unchanged.

- [ ] **Step 1: Replace syntax-specific success expectations with capability-deny expectations**

Create a table-driven test named `capability deny rejects unsupported loader roots before value propagation`. Each fixture must execute first and return `construction-executed`, then audit. Include these sources and expect `violation + unresolved >= 1`, never `0/0`:

```js
const deniedSources = [
  "import Module from 'node:module'; export default Module.createRequire(import.meta.url)('../../construction/target.cjs');",
  "import { default as Module } from 'node:module'; export default Module['createRequire'](import.meta.url)('../../construction/target.cjs');",
  "const make = require('node:module').createRequire; module.exports = make(__filename)('../../construction/target.cjs');",
  "module.exports = module.constructor.createRequire(__filename)('../../construction/target.cjs');",
  "module.exports = process.getBuiltinModule('node:module').createRequire(__filename)('../../construction/target.cjs');"
];
```

Keep separate execution-proven fixtures for long alias chains, default parameters, implicit returns, destructuring assignments, throw/catch, ESM re-export and CJS export. Their exact diagnostic code may differ, but all must fail closed.

- [ ] **Step 2: Add the allowed-language and shadowing controls**

Add a test named `capability deny allows only literal static edges and shadowed local names` covering:

```js
import { isBuiltin } from 'node:module';
export default isBuiltin('node:fs');
```

```js
function local(require, module, process, evalFn, FunctionCtor) {
  return [require('safe'), module.require('safe'), process(), evalFn(), FunctionCtor()];
}
export default local(
  () => 'local-require',
  { require: () => 'local-module' },
  () => 'local-process',
  () => 'local-eval',
  () => 'local-function'
);
```

Also assert literal ESM import/export/dynamic import and direct unshadowed CJS `require('literal')` resolve as dependency edges, while computed specifiers return one stable unresolved fact.

- [ ] **Step 3: Run the focused tests to verify RED**

Run:

```bash
node --test --test-isolation=none --test-name-pattern="capability deny" test/playbookP3Gate.test.js
```

Expected: at least the current long-alias, assignment/default/implicit-return and alternate-loader fixtures fail because the taint scanner returns `0/0`; safe controls that contradict the new policy may also fail until their expectations are updated.

- [ ] **Step 4: Replace propagated taint with lexical capability classification**

Keep Acorn parsing and replace `TAINT_*`, `propagateBindingTaint`, fixed-point passes and opaque factory inference with these internal concepts:

```js
const STATIC_EDGE_MODES = Object.freeze({ ESM: 'esm', CJS: 'cjs' });

function scanModuleDependencies({
  source,
  extension,
  modulePath,
  auditImplementationPath
}) {
  const program = parseModule(source, extension);
  const lexical = buildLexicalBindings(program);
  const dependencies = [];
  const unresolvedCodes = new Set();

  walkProgram(program, (node, parent) => {
    collectStaticDependency(node, parent, lexical, dependencies, unresolvedCodes);
    collectDeniedCapability({
      node,
      parent,
      lexical,
      modulePath,
      auditImplementationPath,
      unresolvedCodes
    });
  });

  return {
    dependencies: uniqueDependencies(dependencies),
    unresolvedCodes: [...unresolvedCodes].sort()
  };
}
```

`buildLexicalBindings` records declarations and answers only `isUnboundGlobal(node, name)`. It must not store or propagate loader taint.

- [ ] **Step 5: Implement literal edge recognition**

Use exact checks:

```js
function literalSpecifier(node) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : null;
}

function isDirectGlobalRequireCall(node, lexical) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'Identifier'
    && node.callee.name === 'require'
    && lexical.isUnboundGlobal(node.callee, 'require');
}
```

Accept only one string-literal argument. For static `ImportDeclaration`, `ExportNamedDeclaration`, `ExportAllDeclaration` and literal `ImportExpression`, add an ESM edge. For direct global `require` or CJS-only global `module.require`, add a CJS edge. Computed specifiers add `COMPUTED_DYNAMIC_IMPORT`, `COMPUTED_REQUIRE`, or `COMPUTED_MODULE_REQUIRE`.

- [ ] **Step 6: Implement source-level capability denial**

Emit stable codes at the first unsafe capability occurrence:

```text
DYNAMIC_NODE_MODULE_CAPABILITY
INDIRECT_REQUIRE_CAPABILITY
INDIRECT_MODULE_REQUIRE_CAPABILITY
PROCESS_BUILTIN_MODULE_CAPABILITY
DYNAMIC_EVAL_CAPABILITY
DYNAMIC_FUNCTION_CAPABILITY
```

Any import/export/require of `node:module` or `module` is denied unless it is exactly the named `isBuiltin` safe import or the Task 2 self-audit exception. A global `require`/`module.require` identifier used outside the accepted direct-call shape is denied. Unbound `process.getBuiltinModule`, `module.constructor`, `eval`, and `Function` are denied by syntax at the root, regardless of later aliasing.

- [ ] **Step 7: Run Task 1 tests to verify GREEN**

Run:

```bash
node --test --test-isolation=none --test-name-pattern="capability deny" test/playbookP3Gate.test.js
```

Expected: all capability-deny fixtures pass; every execution-proven malicious fixture reports either a construction violation or at least one unresolved fact; safe shadowed names remain `0/0`.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/playbook/manual/manualDependencyBoundary.js test/playbookP3Gate.test.js
git commit -m "refactor(playbook): deny dynamic loader capabilities"
```

---

### Task 2: Lock the Resolver Self-Exception and Full Dependency Graph

**Files:**
- Modify: `test/playbookP3Gate.test.js`
- Modify: `src/playbook/manual/manualDependencyBoundary.js`

**Interfaces:**
- Consumes: Task 1 `scanModuleDependencies` and existing `resolveDependency({ importerPath, dependency })`.
- Produces: exact structural self-exception for the audit implementation; recursive static dependency graph with no dynamic capability inference.

- [ ] **Step 1: Write resolver self-exception RED tests**

Add `audit resolver exception is physical-file and AST-shape bound`. Copy the real audit module into a temporary fixture and verify the existing expression is accepted:

```js
createRequire(pathToFileURL(importerPath)).resolve(dependency.specifier)
```

Mutate the fixture one case at a time and expect one unresolved fact for:

```js
createRequire(import.meta.url)('../../construction/target.cjs')
const load = createRequire(import.meta.url);
export { load };
createRequire(pathToFileURL(importerPath))[method](dependency.specifier)
```

Add a path-spoof fixture with the same source in `src/playbook/manual/not-the-auditor.js`; it must be denied.

- [ ] **Step 2: Run the self-exception tests to verify RED**

Run:

```bash
node --test --test-isolation=none --test-name-pattern="resolver exception" test/playbookP3Gate.test.js
```

Expected: the current broad taint/self-consumption behavior fails at least one path or shape mutation.

- [ ] **Step 3: Implement the exact exception**

Determine `auditImplementationPath` once with `fileURLToPath(import.meta.url)` and compare realpaths. Accept `createRequire` only when `isTrustedResolverCall(node, parent, context)` proves all of:

```js
function isTrustedResolverCall(node, parent, context) {
  return context.modulePath === context.auditImplementationPath
    && node.type === 'CallExpression'
    && isNamedImportBinding(node.callee, 'createRequire', 'node:module', context.lexical)
    && isPathToFileUrlImporterArgument(node.arguments)
    && parent?.type === 'MemberExpression'
    && parent.object === node
    && !parent.computed
    && parent.property?.name === 'resolve'
    && context.parentMap.get(parent)?.type === 'CallExpression'
    && isDependencySpecifierArgument(context.parentMap.get(parent).arguments);
}
```

The exception does not suppress ordinary static import graph collection or construction/outside-project checks for the audit file.

- [ ] **Step 4: Preserve Node-aware resolution and non-execution behavior**

Keep exact runtime dependencies `acorn@8.15.0` and `import-meta-resolve@4.2.0`. Preserve ESM import conditions, CJS require conditions, package imports, self-reference, extension/index lookup, built-ins, symlink realpath checks, missing targets, outside-project rejection and cycles.

Add or retain marker assertions proving the audit reads/parses source but never executes the target module.

- [ ] **Step 5: Run the complete dependency attack matrix**

Run:

```bash
node --test --test-isolation=none --test-name-pattern="manual dependency|capability deny|loader|resolver exception|package imports|self-reference|symlink" test/playbookP3Gate.test.js
```

Expected: all tests pass; no fixture that returns `construction-executed` receives audit `0/0`; duplicate root capabilities produce deterministic de-duplicated unresolved codes.

Also assert the public audit object and its arrays remain frozen, and unresolved facts contain only project-relative paths plus stable codes—never source snippets or absolute private paths.

- [ ] **Step 6: Delete obsolete taint machinery and inspect complexity**

Verify all of these searches return no production matches:

```bash
rg -n "TAINT_|propagateBindingTaint|maximumPasses|opaqueTaint|recordEscapedTaint" src/playbook/manual/manualDependencyBoundary.js
```

Run:

```bash
git diff --check
node --check src/playbook/manual/manualDependencyBoundary.js
```

Expected: both commands succeed; the scanner has no fixed-point convergence path.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/playbook/manual/manualDependencyBoundary.js test/playbookP3Gate.test.js
git commit -m "test(playbook): lock dependency resolver boundary"
```

---

### Task 3: Unify Normalized Public-Leak Ranges

**Files:**
- Modify: `test/playbookV01Compiler.test.js`
- Modify: `test/playbookP3Gate.test.js`
- Modify: `src/playbook/manual/playbookV01Compiler.js`

**Interfaces:**
- Consumes: artifact strings from `compilePlaybookV01` and descriptor-read checked snapshots.
- Produces: unchanged `public_leak_count: number`; internal `normalizePublicText(raw) -> { text, rawRanges, exhausted }` and `findPublicLeakRanges(raw) -> Array<{ start, end, kind }>`.

- [ ] **Step 1: Write the normalized token matrix RED tests**

Add a pure audit table with exact expected counts:

```js
const leakCases = [
  ['file:/home/alice/a.txt', 1],
  ['FILE://server/share/a.txt', 1],
  ['f%69le:%2F%2F%2Fhome%2Falice%2Fa.txt', 1],
  ['/%5Cserver%5Cshare%5Ca.txt', 1],
  ['\\\\?\\UNC\\server\\share\\a.txt', 1],
  ['h%74tps://example.test/?next=/home/alice/public.txt', 0],
  ['https://example.test/?next=file:/home/alice/a.txt', 1],
  ['https://example.test/?a=file:/one&a=file:/two', 2]
];
```

Include mixed separators, mixed-case `%HH`, eight rounds, ninth-round exhaustion, malformed `%`, overlapping matchers and two whitespace-separated references. Repeat the critical cases through `auditCheckedInPlaybookV01` so descriptor snapshot behavior uses the same scanner.

- [ ] **Step 2: Run leak tests to verify RED**

Run:

```bash
node --test --test-isolation=none --test-name-pattern="public leak|file URL|UNC|percent|HTTPS" test/playbookV01Compiler.test.js test/playbookP3Gate.test.js
```

Expected: mixed UNC, extended UNC and two file tokens inside one HTTPS query fail under the current greedy matcher/range model.

- [ ] **Step 3: Implement one bounded normalized view**

Use a deterministic representation:

```js
function normalizePublicText(raw) {
  let units = [...raw].map((character, index) => ({
    character,
    rawStart: index,
    rawEnd: index + character.length
  }));
  let exhausted = false;
  for (let round = 0; round < 8; round += 1) {
    const decoded = decodeAsciiPercentUnits(units);
    units = decoded.units;
    if (!decoded.changed) return toNormalizationResult(units, false);
    exhausted = round === 7 && containsDecodableAsciiPercent(units);
  }
  return toNormalizationResult(units, exhausted);
}
```

Do not call unbounded `decodeURIComponent`; malformed input must remain literal and must not throw.

- [ ] **Step 4: Tokenize high-priority file and UNC references**

Recognize case-insensitive `file:` followed by one or more slash/backslash characters. Recognize UNC prefixes containing at least two slash/backslash separators, including mixed `/\\`, and Windows extended UNC `\\?\\UNC\\`. End tokens at whitespace, quotes, brackets or a new URI scheme delimiter so adjacent references cannot be greedily merged.

Map every normalized token back to `[rawStart, rawEnd)` using the first and last unit. Add a conservative `PERCENT_NORMALIZATION_EXHAUSTED` range when `exhausted` is true.

- [ ] **Step 5: Derive HTTPS exceptions from the same normalized view**

Tokenize normalized `https://...` ranges. Ordinary Unix-looking paths contained in an HTTPS token are exempt. File/UNC high-priority tokens are never exempt, even when nested in query or fragment text.

Merge only findings with the same kind and identical raw interval. Do not union adjacent or overlapping different high-priority file tokens; two distinct `file:` starts count twice.

- [ ] **Step 6: Run pure and checked-snapshot leak suites to verify GREEN**

Run:

```bash
node --test --test-isolation=none --test-name-pattern="public leak|file URL|UNC|percent|HTTPS" test/playbookV01Compiler.test.js test/playbookP3Gate.test.js
```

Expected: all cases pass with their exact counts; malformed input is deterministic and non-throwing; bounded decode exhaustion blocks.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/playbook/manual/playbookV01Compiler.js test/playbookV01Compiler.test.js test/playbookP3Gate.test.js
git commit -m "fix(playbook): normalize public leak ranges"
```

---

### Task 4: Integrate, Report, Review, and Verify

**Files:**
- Modify: `.superpowers/sdd/2026-08-25-architecture-playbook-v0-1/residual-fix-report.md`
- Test: `test/playbookP3Gate.test.js`
- Test: `test/playbookV01Compiler.test.js`
- Test: `test/architecturePlaybookManualCli.test.js`
- Test: all project tests through `npm test`

**Interfaces:**
- Consumes: Tasks 1–3 public audit contracts.
- Produces: clean branch state whose checked-in P3 gate is fail-closed and whose five generated artifacts have zero drift.

- [ ] **Step 1: Add final architecture facts to the gate test**

Assert all of the following:

```js
assert.equal(source.includes('propagateBindingTaint'), false);
assert.equal(source.includes('maximumPasses'), false);
assert.equal(source.includes('TAINT_LOADER'), false);
assert.match(source, /DYNAMIC_NODE_MODULE_CAPABILITY/u);
assert.match(source, /INDIRECT_REQUIRE_CAPABILITY/u);
```

Keep report assertions truthful: the old taint/fixed-point rounds are historical and superseded by capability-deny scanning.

- [ ] **Step 2: Run exact focused verification**

Run:

```bash
node --test --test-isolation=none \
  test/playbookP3AdmissionPolicy.test.js \
  test/playbookReviewedRuleCard.test.js \
  test/playbookV01Compiler.test.js \
  test/playbookP3Gate.test.js \
  test/architecturePlaybookManualCli.test.js \
  test/architecturePlaybookCourseCli.test.js \
  test/architecturePlaybookEvidenceCli.test.js
```

Expected: zero failures.

- [ ] **Step 3: Verify managed artifacts and Git boundary**

Run:

```bash
npm run playbook:manual -- check
git diff --check
git ls-files .local/architecture-playbook
git status --short
```

Expected: manual check reports `current`, `artifact_count=5`, `managed_artifact_drift_count=0`; the `.local` query, diff check and status are empty except the intended report change before commit.

- [ ] **Step 4: Run the full suite**

Run:

```bash
npm test
```

Expected: exit code 0 and zero failed tests. Run through the permitted real-subprocess path when the restricted sandbox suppresses nested CLI stdout or Git subprocesses.

- [ ] **Step 5: Update the residual evidence report**

Append:

```text
Architecture result: taint/fixed-point analysis removed.
Dependency result: only literal static edges accepted; unsupported loader roots fail closed.
Leak result: file/UNC and HTTPS ranges share one bounded normalized view.
Runtime result: no construction/runtime/resource-registry file changed.
Artifact result: five managed outputs current with zero drift.
```

Record exact RED counts, GREEN counts, focused/full counts, commit IDs and any environment-only sandbox distinction.

The report may claim only that the checked dependency syntax belongs to the accepted static subset and unsupported loader roots fail closed. It must continue to state that P3 generated no house, proved no visual improvement and granted no runtime authority.

- [ ] **Step 6: Commit the integration evidence**

```bash
git add .superpowers/sdd/2026-08-25-architecture-playbook-v0-1/residual-fix-report.md test/playbookP3Gate.test.js
git commit -m "docs(playbook): record capability gate verification"
```

- [ ] **Step 7: Request independent scoped review**

Review the complete implementation range from `655803e` to the new HEAD. Require the reviewer to run execution-proven attempts for dynamic loader roots, confirm the structural self-exception cannot be copied or widened, test normalized file/UNC/HTTPS ranges, and report every Critical/Important issue before merge readiness.

- [ ] **Step 8: Controller final verification**

After review findings are addressed, rerun the exact focused suite, `npm run playbook:manual -- check`, `npm test`, `git diff --check`, private tracking check and `git status --short` from the controller. Do not claim P3 complete based only on subagent results.
