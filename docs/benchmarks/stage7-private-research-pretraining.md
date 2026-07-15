# Stage 7 Private-Research Pretraining Isolation Evidence

## Scope

This record covers tooling only. It does not record an external template, a private source path, a source URL, a raw-content hash, trained weights, a checkpoint, a generated building, or a quality result. All automated checks used generated synthetic bytes below Git-ignored `.tmp/` roots.

The private-research path is separate from Dataset v1/v2/v3 and M3. It is local-only, offline, and non-distributable. Its fixed provenance markers are `rights_state: unverified`, `distribution: prohibited`, and `purpose: local-private-research-only`. It does not make any source training-eligible and does not enable M4 Apply Mode.

## Verified command boundaries

The Node corpus boundary and M3 regression checks are run with:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node --test test/stage7PrivateResearchBoundary.test.js test/stage7PrivateResearchCorpus.test.js test/stage7PrivateResearchCli.test.js test/schematicBlockVolume.test.js test/stage7M3Fixtures.test.js test/stage7PythonProvider.test.js
```

The private Python data/model/trainer checks and existing Dataset/M3 acceptance checks are run with:

```bash
conda run -n mcagent-stage7 --cwd training/stage7 python -m pytest -q tests/test_private_research.py tests/test_private_research_model.py tests/test_train_private_research.py tests/test_dataset.py tests/test_acceptance.py
```

Task-boundary regressions are run with:

```bash
npm test
npm run test:stage7:m3
```

The final formal boundary inspection is:

```bash
/home/guoba/.nvm/versions/node/v24.18.0/bin/node -e "const fs=require('fs'); const crypto=require('crypto'); const p=['mc_templates/datasets/coarse_semantic_voxels/v1/manifest.json','mc_templates/datasets/coarse_semantic_voxels/v2/manifest.json','mc_templates/datasets/coarse_semantic_voxels/v3/manifest.json']; console.log(JSON.stringify(p.map(x=>[x,crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex')]))); const m=JSON.parse(fs.readFileSync(p[2],'utf8')); console.log(JSON.stringify({ready_for_m3_real_data:m.ready_for_m3_real_data,training_eligible_count:m.training_eligible_count}));"
```

Expected Dataset manifest SHA-256 values are:

- v1: `fb52190f58102540f19bab741ec5ce1a121134d86b88a699b78c2af5bb788749`
- v2: `af3c8b5b9d9a628a78caf2de95f42c1d6aedcdf301b24d2909d21418bdfec654`
- v3: `5f5873b3a181910598dc9cf1a7407b3140fe2e3e23d18ca2d79026720f30b082`

The expected v3 gate remains:

```json
{"ready_for_m3_real_data":false,"training_eligible_count":0}
```

## Refusal guarantees

Before any private training run can create output, the implementation requires: an owner-created acknowledgement; an ignored, untracked private root; no symbolic-link escapes; valid source and prepared binary hashes; a deterministic split without repeated source groups; exact `64 × 64 × 64` categorical volumes; formal Dataset manifest hashes; and the v3 false/zero gate. The trainer rechecks the formal boundary after writing artifacts.

The private trainer accepts only an explicit `--private-research-only` command-line acknowledgement. It has no source download, upload, experiment tracker, export, M3 provider, M4 Apply Mode, or primary-construction integration.
