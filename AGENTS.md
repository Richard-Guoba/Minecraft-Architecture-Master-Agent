# Codex Agent Instructions

Read and follow [AGENT.md](./AGENT.md) first. Both files apply; this file adds
test-process memory safety rules without replacing any existing project
instructions.

## Node.js test memory safety

- Run Node.js tests only through `npm test -- <test arguments>`.
- Never invoke `node --test` directly, including from a Codex subagent.
- The supported test entry point limits Node's heap to 1536 MiB, defaults test
  concurrency to 2, and clamps larger requested concurrency values to 2.
- On Linux, tests must run in the hard systemd scope configured by
  `scripts/runNodeTests.js`: `MemoryHigh=4G`, `MemoryMax=6G`, and
  `MemorySwapMax=512M`.
- If the Linux hard-memory backend is unavailable, stop and report the error.
  Use `MC_TEST_ALLOW_SOFT_FALLBACK=1` only after the user explicitly
  authorizes an unbounded run.
- Run the narrowest relevant test first. Do not run the full suite while
  diagnosing a failure or memory regression.
