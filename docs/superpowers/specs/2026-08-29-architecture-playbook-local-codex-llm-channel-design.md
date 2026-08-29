# Local Codex LLM Channel Design

**Date:** 2026-08-29  
**Status:** Proposed, verbally approved; awaiting written-spec review  
**Scope:** Add an explicitly selectable local Codex CLI provider to the Minecraft Architecture Agent workflow

## Decision Summary

The execution CLI will accept this workflow:

```bash
npm run playbook:execute -- --mode llm --llm-provider codex "Build ..."
```

Selecting `codex` will run the locally installed and authenticated Codex CLI as the workflow's LLM provider. The adapter will use non-interactive `codex exec`, pass prompts through standard input, request schema-constrained JSON, and run Codex with a read-only sandbox. Explicit Codex selection is fail-closed: it will never silently switch to Zhipu, OpenAI-compatible, mock, or another provider.

The repository already contains an initial `CodexClient` and Codex-related environment settings. This change will harden and complete that path rather than create a second integration.

## Context and Problem

The current workflow can run with API-backed LLM providers, but those channels are not reliable in the user's environment. A partial Codex CLI adapter exists, yet it is not exposed as a first-class execution option and explicit Codex selection currently participates in provider fallback. It also lacks sufficient CLI validation, lifecycle hardening, and focused tests.

The user already has a local Codex installation and selects it in a terminal by writing `codex`. The new channel should reuse that authenticated local setup and the model configured by that setup, without requiring an API key or adding a model override to the playbook CLI.

## Goals

- Expose local Codex through `--llm-provider codex` in the playbook execution CLI.
- Preserve the existing agent contract, `chatJson({ system, user })`.
- Use the locally authenticated Codex CLI and its configured default model.
- Make explicit Codex selection strict and fail-closed.
- Keep Codex unable to modify the project while acting as the workflow's LLM.
- Return JSON objects compatible with the existing architect, planner, creative, and P5 pipeline validators.
- Provide clear, sanitized failures for missing setup, process failures, timeouts, and invalid output.
- Preserve existing mock, disabled/default-off, replay, and API-provider behavior.
- Test the integration deterministically without live Codex calls.

## Non-Goals

- Replacing the existing API provider implementations.
- Giving the spawned Codex process permission to edit the repository.
- Selecting or configuring a Codex model through the playbook command.
- Introducing an interactive Codex terminal session.
- Adding a new architecture-agent stage or changing P5 design behavior.
- Using Codex during deterministic replay.
- Making live, billed, network-dependent Codex calls part of the automated test suite.

## User Interface

The supported command is:

```bash
npm run playbook:execute -- --mode llm --llm-provider codex "Build a medieval stone gatehouse"
```

The CLI help will document `--llm-provider codex` and the existing provider vocabulary. The provider flag is a single-value option:

- A duplicate `--llm-provider` is rejected.
- A missing value or unsupported value is rejected before workflow output is created.
- `--llm-provider` is valid with `--mode llm`.
- Combining an explicit provider with `--mode mock` is rejected because the request is contradictory.
- `--mode auto` retains its existing environment-driven behavior; callers that require Codex use `--mode llm --llm-provider codex`.

The CLI flag takes precedence over `LLM_PROVIDER`. Existing environment-based configuration remains supported for non-CLI callers.

## Architecture

### CLI and option propagation

The playbook CLI parses `--llm-provider`, validates it alongside `--mode`, and forwards the normalized value through the execution options. The pipeline passes that value to the LLM client factory without mutating `process.env`.

This makes provider selection request-scoped and prevents one execution from changing another execution's provider through shared global state.

### Provider factory

`createLlmClient` will accept an explicit `provider` option in addition to its existing environment and working-directory inputs.

Selection behavior will be:

- Explicit `provider: "codex"`: return a `CodexClient` directly.
- `LLM_PROVIDER=codex` when no request override exists: return a `CodexClient` directly.
- `auto`: preserve the existing ordered fallback policy.
- Existing named API providers: preserve their current behavior.

The important behavioral correction is that a named provider is a commitment, not a hint. Codex failures must remain Codex failures. Only the explicitly selected `auto` policy may choose another client.

### Codex adapter

The existing `CodexClient` remains the single adapter for this channel. It implements the same `chatJson` interface consumed by existing agents.

For each request it will:

1. Create a private temporary directory.
2. Write a JSON output schema that requires a top-level object.
3. Construct a prompt from the `system` and `user` inputs.
4. Spawn the configured executable directly, without a shell.
5. Invoke non-interactive `codex exec` with an enforced read-only sandbox, ephemeral session storage, no color, an output-schema path, a final-output path, and `-` for standard-input prompting.
6. Send the prompt on standard input and close the stream.
7. Wait for successful completion within the configured timeout.
8. Read and strictly parse the final-output file as JSON.
9. Return the object to the existing downstream contract validators.
10. Remove the temporary directory on every success or failure path.

The schema at this boundary guarantees a JSON object. Existing stage-specific validators remain authoritative for architect, planner, creative, and P5 response shapes. This avoids expanding every LLM client interface as part of this integration.

## Process Protocol and Lifecycle

The default executable and arguments remain configurable:

```dotenv
CODEX_COMMAND=codex
CODEX_ARGS=exec --sandbox read-only --ephemeral --color never
CODEX_TIMEOUT_MS=600000
```

The longer default timeout reflects that one playbook run can make several sequential design calls and that a local Codex request may reasonably exceed two minutes. The timeout applies to each Codex request rather than to the whole pipeline. `CODEX_ARGS` may contribute safe optional exec flags, but the adapter owns and de-duplicates the sandbox, ephemeral, color, schema, final-output, and stdin-prompt arguments. Conflicting or bypass arguments fail with `CODEX_CONFIGURATION_INVALID` before a child is spawned.

Implementation requirements:

- Spawn with an argument array and `shell: false`; never interpolate prompts into a shell command.
- Use the project root as the child working directory.
- Preserve the user's normal local Codex authentication and configuration discovery.
- Do not add a model flag, so the local Codex default remains authoritative.
- Bound captured standard output and standard error to prevent an unbounded child process from consuming memory.
- On timeout, terminate the child process tree, escalate to forced termination after a short grace period, and wait for its inherited streams to close.
- Settle the request promise exactly once even if timeout, exit, and stream errors race.
- Clean temporary files in a `finally` path.
- Treat a missing output file, empty output, non-object JSON, malformed JSON, or output larger than 1 MiB as a provider failure.
- Do not attempt to repair malformed Codex output from console text.

## Error Model

Failures are categorized internally so diagnostics remain actionable:

- **Unavailable:** executable not found or cannot be spawned.
- **Setup/authentication:** Codex exits before producing a response because local setup is incomplete.
- **Timeout:** the configured per-request deadline expires.
- **Execution:** Codex exits non-zero.
- **Protocol:** output is missing, empty, malformed, or not a JSON object.
- **Configuration:** optional arguments conflict with the enforced read-only JSON protocol.
- **Contract:** an existing downstream stage validator rejects the object's content.

The user-facing error identifies the Codex channel and the category, with a concise next action where appropriate. It must not include the complete prompt, environment variables, authentication material, or unbounded stdout/stderr. A short sanitized diagnostic excerpt may be included when it contains no prompt content or secrets.

Explicit Codex errors propagate to the workflow's existing failure boundary. They never trigger provider fallback. The existing P5 public-error sanitization remains in force.

## Security and Trust Boundary

The spawned Codex process is an external local executable selected by configuration. The implementation will:

- Default to `codex` and never invoke through a shell.
- Enforce Codex's read-only sandbox and reject writable/bypass argument overrides so the LLM channel cannot edit repository files.
- Use ephemeral execution so Codex does not persist session rollout files.
- Pass the prompt only through standard input.
- Avoid logging prompts, environment contents, or raw model output in provider errors.
- Create temporary schema and output files with user-private access through the platform's secure temporary-directory mechanism.
- Bound the final JSON output file to 1 MiB and always remove temporary files after use.

The process runs from the project root and uses the user's existing Codex configuration and authentication. Therefore, project context supplied in prompts may be sent to the Codex service under the user's logged-in account; documentation will make this boundary explicit.

## Compatibility

- Runs without `--llm-provider` keep their current selection behavior.
- `--mode mock` remains deterministic and must produce byte-compatible output.
- Disabled/default-off P5 behavior remains byte-compatible.
- Existing Zhipu and OpenAI-compatible clients remain available.
- `auto` remains the only provider-selection mode allowed to fall back.
- Deterministic replay does not instantiate an LLM client and remains provider-independent.
- No persisted artifact schema changes are required solely to add this provider selector.

## Testing Strategy

Implementation follows test-driven development. Automated tests will use a fake local executable rather than the real Codex service.

### Codex client tests

The fake executable will inspect the arguments and standard input, then emulate Codex by writing the requested output file. Tests will cover:

- Successful JSON-object response.
- Prompt delivery through standard input.
- Required output-schema and output-file arguments.
- Read-only execution arguments.
- Executable-not-found behavior.
- Non-zero exit behavior.
- Timeout, termination, and single settlement.
- Missing, empty, malformed, array, and primitive output.
- Temporary-directory cleanup after success and failure.
- Bounded and sanitized diagnostic handling.

### Provider-factory tests

Tests will prove:

- Explicit `codex` returns `CodexClient`, not `FallbackLlmClient`.
- `LLM_PROVIDER=codex` is strict.
- CLI/request provider override wins over environment configuration.
- `auto` retains existing fallback behavior.
- Existing providers retain their current selection behavior.

### CLI and pipeline tests

Tests will prove:

- The documented command reaches Codex through the pipeline.
- Help text describes the option.
- Duplicate, missing, unsupported, and mode-incompatible flags fail before output creation.
- The provider option is request-scoped and does not mutate global environment state.
- Omitted provider selection leaves existing behavior unchanged.
- Mock and default-off snapshot/byte-compatibility tests continue passing.
- Replay remains free of LLM-provider construction.

### Manual smoke test

After automated verification, a user with a locally authenticated Codex installation can run:

```bash
npm run playbook:execute -- --mode llm --llm-provider codex "Build a compact medieval stone gatehouse"
```

The smoke test is optional and separate from CI because it can use network access, time, and account usage.

## Documentation Changes

The implementation will update:

- CLI help and execution examples.
- Environment-variable documentation for `CODEX_COMMAND`, `CODEX_ARGS`, and `CODEX_TIMEOUT_MS`.
- Local prerequisites: the `codex` command must be available and authenticated.
- Troubleshooting for unavailable, login/setup, timeout, execution, and protocol failures.
- The trust note explaining that the child is read-only locally but LLM prompts use the user's Codex service account.

## Acceptance Criteria

The feature is complete when all of the following are true:

1. The exact documented command selects local Codex and completes a normal LLM workflow when Codex is installed and authenticated.
2. Codex uses its locally configured default model; the playbook adds no model override.
3. The Codex child runs non-interactively, receives its prompt through stdin, and has a read-only sandbox.
4. Existing agents receive JSON objects through their unchanged `chatJson` contract.
5. Explicit Codex selection never falls back to another provider or mock output.
6. Invalid CLI combinations fail before workflow artifacts are written.
7. Missing setup, timeout, non-zero exit, and invalid output produce clear, sanitized errors.
8. Child processes and temporary files are cleaned up on all paths.
9. Automated tests use a fake executable and make no live Codex calls.
10. The full existing test suite passes, including byte-compatibility and replay coverage.

## Rollout

This is an additive opt-in channel. Existing commands are unaffected until a caller explicitly chooses Codex or configures `LLM_PROVIDER=codex`. No artifact migration is needed. If a local Codex installation is unhealthy, only Codex-selected executions fail; other provider and mock workflows remain available through their existing explicit configurations.
