## Test-discovery crash-worker fix

Task 10's first full-suite run completed without OOM but found one test-discovery failure: Node discovered `test/fixtures/playbookP6StorageCrashWorker.js` and the fixture unconditionally tried to read an absent `process.argv[2]`. The established execute-worker fixture already guards its job path.

Strict TDD evidence:

```text
npm test -- test/playbookP6Storage.test.js --test-name-pattern="P6 crash worker skips execution"
RED: the new no-job process assertion failed; the worker emitted the missing-path error and exited nonzero.

npm test -- test/playbookP6Storage.test.js --test-name-pattern="P6 crash worker skips execution"
GREEN: the no-job worker exited 0 with empty stdout/stderr and left its empty working directory unchanged; the P6 storage suite, including the existing job-driven SIGKILL crash and recovery cases, passed.
```

The minimal fix matches the existing execute crash-worker pattern: invoke the unchanged crash job only when a job path is present. No world, cohort, capture, or human operation was performed.
