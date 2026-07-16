# Stage 7 Rights-Cleared Source Expansion Pilot Design

**Date:** 2026-07-16

**Status:** approved for planning; not authorization to download building payloads, alter a Dataset, or train

## 1. Purpose

Stage 7 needs substantially more architectural examples than the current small private-research corpus can provide. The immediate goal is not to collect as many files as possible. It is to prove that at least one reliable, high-yield source can produce dozens of downloadable, training-usable, technically compatible, visually worthwhile buildings with a complete rights record.

The pilot will discover public candidates, fail closed on rights, rank candidates using source-relative quality signals, and give the owner a concrete review list. Its target is 50 review cards and at least 20 accepted buildings. A successful pilot may later justify controlled hundred-item batches and eventually a thousand-scale collection. It does not itself admit anything to a formal Dataset.

## 2. Immutable boundaries

The following boundaries apply throughout discovery, implementation, and later operation:

- Do not modify Dataset v1, v2, or v3. Dataset v3 must remain `ready_for_m3_real_data=false` and `training_eligible_count=0`.
- Do not mix new candidates into the current private corpus, its prepared manifest, its split, or any current training run.
- Do not modify normal Node generation, the Stage 7 primary provider, or M4 Apply Mode.
- Do not process the 42 deferred oversized private buildings. Do not add tiling, cropping, or rescaling.
- Do not push, publish, upload, share, package, or export private sources, metrics, reconstructions, checkpoints, weights, generated output, or locally staged candidate payloads.
- Keep all candidate payloads and operational audit state under a new ignored local root, separate from `.local/stage7-private-research/`.
- Work sequentially. Do not use parallel agents, concurrent acquisition jobs, or concurrent private training runs.
- While the current private training run is active, perform only lightweight public-metadata and license research. Payload download, parsing, voxel conversion, and resource-intensive validation wait until that run ends.
- A candidate's presence on a download site, a repository-level license badge, popularity, or an aggregator's dataset license is not sufficient evidence that its underlying building asset may be used for training.

The pilot is local-only even when a source appears permissively licensed. Public release or redistribution would require a separate design and approval.

## 3. Approaches considered

### A. Audit high-yield sources, then filter individual assets — selected

Start with a small number of repositories, mod projects, or archives that expose many structures and a coherent rights story. Audit public metadata and the license chain before downloading payloads. Once a source passes, sample a few representative assets, rank them, and ask the owner to review them.

This route offers the best chance of reaching hundreds or thousands without negotiating separately with every creator. Its trade-off is that one ambiguous upstream dependency can quarantine an otherwise attractive source.

### B. Request permission from many individual creators — not the primary route

Direct permission can create strong evidence for specific assets, but response rates, negotiation time, inconsistent terms, and possible fees make it unsuitable as the main scaling mechanism. It remains an optional later route for unusually valuable buildings.

### C. Bulk-scrape popular schematic platforms or trust repackaged datasets — rejected

Download availability and popularity do not transfer copyright or training permission. Platform terms may prohibit systematic extraction, redistribution, or non-personal use, and repackaged datasets may apply a license without proving rights to the underlying schematics. Such sources may be recorded as research leads but cannot enter the formal-candidate path without an independently complete asset-level chain.

## 4. Pilot scope and terms

The pilot has two strictly separated tracks:

1. **Rights-cleared formal-candidate track:** candidates with sufficient evidence for local download, transformation, training use, and the intended downstream research artifacts, with no conflicting upstream restriction.
2. **Uncertain research quarantine:** metadata-only leads whose rights are incomplete, conflicting, or limited. New payloads are not downloaded into this track. It may reference owner-supplied local material already governed by the existing private protocol, but it never promotes that material automatically.

`formal_candidate` means only that an isolated source-expansion candidate passed this pilot's rights, human, and technical gates. It does not mean Dataset v3 eligibility, training inclusion, evaluation inclusion, publication permission, or M4 eligibility.

Popularity is a ranking signal, not evidence of ownership, permission, technical validity, or objective architectural quality.

## 5. Isolated architecture

Future implementation will divide the workflow into five components with narrow interfaces.

### 5.1 Metadata discovery registry

Source adapters collect public metadata only: canonical source page, asset page, author or project identity, claimed license, upstream references, available preview links, supported file formats, public dimensions when present, popularity signals, review signals, and observation date.

The registry does not fetch schematic, world, archive, blueprint, or preview-image payloads. Review cards link to the public preview page instead of copying its images during the metadata-only phase.

### 5.2 Rights evidence ledger

The ledger keeps evidence separate from the discovery record. Each reviewable asset records:

- the exact asset or asset-family scope covered by the license;
- the canonical license text or authoritative project statement and its observation date;
- the author, upstream authors, bundled dependencies, and source provenance;
- whether local download, copying, format conversion, training computation, derivative research artifacts, and the intended local retention are permitted;
- any AI, machine-learning, automated-use, non-commercial, attribution, share-alike, or redistribution conditions;
- conflicts between project, platform, asset, and upstream terms; and
- the review conclusion and reason code.

An open-source repository license counts only when evidence shows that the building assets are covered by it and were contributed with compatible rights. A dataset-card license does not override incompatible upstream terms. Legal uncertainty is recorded as uncertainty; the tool must not present an automated conclusion as legal advice.

### 5.3 Quality ranking engine

The ranker orders only candidates that passed the rights hard gate. Its signals are:

- source-relative and, where possible, age-adjusted download or usage percentile;
- source-relative positive-review, favorite, follower, or approval percentile;
- preview completeness and consistency;
- complete building versus fragment, mirror, trivial upgrade, or near-copy;
- supported format, dimensions, block palette, and expected parser compatibility;
- duplicate or near-duplicate risk; and
- underrepresented building type or architectural style.

Platform-derived popularity and reception are normalized within the same source because raw counts are not comparable across platforms. When a source exposes publication dates and a same-year cohort contains at least 10 candidates, percentile normalization uses that cohort; otherwise it uses the complete source. A missing signal is `unknown`, not zero. The score is the weighted mean of available signals after their weights are normalized, and evidence coverage is the sum of their original weights. Candidates below 60 percent coverage enter a separately labelled low-evidence lane. Candidates with no comparable signal are marked `unranked`. Both groups remain eligible for human review and are not assigned a fabricated zero score.

The initial ordering uses these allocations: popularity 30 percent, positive reception 20 percent, preview completeness 15 percent, building completeness 15 percent, technical compatibility 10 percent, and type/style scarcity 10 percent. Confirmed duplicate or near-duplicate evidence applies a penalty of up to 25 percentage points. The score prioritizes review; it never overrides a failed right, technical, or human gate.

### 5.4 Human review-card generator

The pilot targets 50 cards in two sequential waves. The discovery wave contains 30 cards, with at most five representatives from one source or asset family, so that the owner sees multiple rights models and styles. After its decisions, the yield-confirmation wave contains 20 additional cards from the strongest rights-cleared sources. A source may contribute at most 15 cards across the complete pilot. This makes it practical to prove that one source yields 10 accepted candidates without allowing it to dominate the initial discovery view. If the rights hard gate cannot supply enough candidates, the wave stops short and reports failure instead of filling the queue with ambiguous candidates. Each card contains:

- public preview and canonical source links;
- author or project attribution;
- license conclusion, evidence link, and observation date;
- source-relative popularity/reception percentiles, ranking score, and evidence coverage;
- building type, style, public dimensions when available, and expected format;
- duplicate, provenance, rights, size, or compatibility warnings; and
- one owner decision: `Accept`, `Defer`, or `Reject`.

`Accept` authorizes later local acquisition only for that named candidate within the approved pilot batch and only after the current training run ends. It does not authorize adjacent assets, a larger scrape, Dataset admission, training, redistribution, or publication.

### 5.5 Isolated acquisition and validation stage

Acquisition cannot begin until the current private training run reaches `completed` state and passes its required post-run audit. A paused, interrupted, or failed run does not satisfy this gate. The resulting completed-run inventory and hashes become the immutable comparison baseline for this pilot.

When acquisition is authorized, all payloads, hashes, technical metadata, and manifests remain below:

```text
.local/stage7-source-expansion/
```

The implementation will use fixed subdirectories for evidence, metadata, review decisions, quarantined downloads, validated candidates, and manifests. Paths must resolve below this root; symbolic links, path escapes, unknown files, and writes to either formal Dataset paths or `.local/stage7-private-research/` fail closed.

Downloads first enter quarantine. A candidate moves to validated storage only after its bytes are hashed, its type is allowlisted, its parser succeeds, its dimensions remain within the already supported non-oversized contract, and duplicate checks complete. The pilot does not convert validated candidates into Dataset records.

## 6. State model and data flow

The permitted forward path is:

```text
discovered
  -> rights_pending
  -> rights_verified
  -> ranked
  -> human_accepted
  -> acquired_quarantine
  -> technically_validated
  -> formal_candidate
```

At any applicable stage, a record may move to `deferred`, `private_research_only`, or `rejected`. These are terminal for automation. Returning one of them to the forward path requires a new evidence record, an explicit owner decision, and a traceable state transition; no tool may promote it automatically.

Rights verification always precedes ranking. Human acceptance always precedes payload acquisition. Technical validation always precedes `formal_candidate`. Formal Dataset admission is a separate future workflow and is absent from this state model.

Records are append-only decisions with stable candidate IDs derived from canonical public identity rather than local filenames. Superseding evidence creates a new decision revision. It does not rewrite the historical conclusion.

## 7. Rights hard gate

A candidate may reach `rights_verified` only when all of the following are supported by authoritative evidence:

1. The actual building asset or uniformly licensed asset family is identifiable.
2. The asset's author or contribution chain is traceable.
3. The applicable terms permit local downloading and copying.
4. The terms permit the conversions and computational use required for model training, or otherwise provide sufficiently broad permission with no conflicting AI/ML restriction.
5. Required attribution, non-commercial, share-alike, or other obligations are recorded and compatible with the intended local research path.
6. Platform terms do not contradict the asset license or prohibit the intended acquisition method.
7. No upstream project, bundled dependency, or individual asset introduces incompatible terms.
8. Evidence URLs and observation dates are present, and the evidence was revalidated no more than 30 calendar days before acquisition.

Failure, ambiguity, missing evidence, or a specific AI-training prohibition cannot be offset by popularity or owner preference. The candidate becomes `deferred`, `private_research_only`, or `rejected` with a reason code.

Before every later acquisition batch, rights evidence is revalidated even when its prior observation is less than 30 days old. A changed page, removed license, changed asset owner, or conflicting new term invalidates the earlier pass until reviewed again.

## 8. Deduplication and technical screening

Metadata-stage duplicate detection uses canonical URLs, project/asset identifiers, author/title normalization, declared mirrors, source-provided image identifiers, and known upstream relationships. It does not fetch preview images. This phase is conservative and may flag rather than reject.

After authorized acquisition, byte hashes identify exact copies. Format-aware structural fingerprints identify converted mirrors and near-duplicates without exposing reconstructed content. A candidate fails technical validation if it is unreadable, encrypted, malicious, path-escaping, unsupported, incomplete, or outside the current non-oversized size contract.

New oversized candidates are recorded as deferred metadata only. They do not enter the existing set of 42 private deferred buildings and do not trigger a tiling, scaling, or cropping path.

## 9. Pilot acceptance and expansion gates

The 50-card pilot succeeds only if all of these conditions hold:

- at least 20 candidates pass rights review and owner review;
- every accepted candidate has an asset-level or demonstrably uniform asset-family license chain;
- at least one high-yield source contributes at least 10 accepted candidates under a consistent rights chain;
- after authorized acquisition, at least 95 percent of acquired candidates parse successfully;
- exact and near-duplicate rate is no more than 10 percent;
- no accepted candidate has an unresolved source-chain, AI/ML, platform-term, or attribution conflict;
- no file escapes the isolated root, no symbolic link exists, and no unknown payload bypasses quarantine; and
- formal Dataset hashes, Dataset v3's false/zero gate, the private corpus, and completed private-run artifacts remain unchanged relative to their post-training baseline.

Failure is useful audit evidence but does not authorize looser gates or automatic replacement downloads.

A successful pilot produces a local report containing public-source references, decision counts, evidence-coverage summaries, parsing/duplicate booleans, and the proposed next source/batch. It contains no private corpus content, staged payload bytes, reconstructions, model artifacts, or private metrics. The owner must approve expansion before collection continues.

Expansion proceeds in owner-approved batches targeting 100 candidates. Each batch repeats rights revalidation, ranking, duplicate checks, and human review of at least 10 percent of the batch, with a minimum of 10 cards. A source may move toward thousand-scale collection only after two consecutive 100-item batches preserve a consistent license chain, at least 95 percent parsing success, no more than 10 percent duplicates, and at least 40 percent human acceptance in the reviewed sample. There is no unbounded crawler or automatic next batch.

## 10. Failure handling

All failures are fail-closed and preserve audit evidence without automatic cleanup or retry.

- Missing, contradictory, stale, or inaccessible license evidence stops the candidate before download.
- HTTP errors, changed URLs, rate limits, or authentication requirements stop the candidate; they do not trigger credential workarounds or aggressive retries.
- Hash, type, parser, containment, duplicate, inventory, or size failures keep the payload quarantined and prevent promotion.
- A changed source license invalidates affected pending and previously accepted candidates until re-review.
- A partial batch does not inherit approval for replacements or adjacent assets.
- A formal Dataset hash, gate, private-corpus, current-run, or Git-binding drift stops the whole operation and is reported to the owner.
- No failure authorizes mass outreach, payment, scraping, tiling, rescaling, training, or publication.

## 11. Verification strategy

Implementation follows test-driven development and uses committed synthetic fixtures or minimal public metadata fixtures only. No real private record, downloaded building payload, model artifact, or private metric enters Git or test output.

Tests must cover:

- legal state transitions and rejection of skipped rights, human, quarantine, or technical gates;
- asset-level and uniform-family evidence, upstream conflicts, AI/ML prohibitions, missing observation dates, and evidence invalidation;
- source-relative percentile normalization, age adjustment when data exists, unknown metrics, evidence coverage, duplicate penalties, and deterministic ordering;
- the 50-card target, five-per-source cap, complete card fields, and deterministic `Accept`/`Defer`/`Reject` recording;
- canonical identity, exact duplicate, mirror, and near-duplicate handling;
- root containment, ignored/untracked enforcement, symlink and path-escape rejection, allowlisted types, hashes, quarantine-first acquisition, and exact inventories;
- unsupported, malformed, malicious, and oversized payload rejection without cropping, scaling, or tiling;
- stable manifests and append-only superseding decisions;
- metadata-only operation during active private training and refusal to acquire payloads in that state;
- unchanged Dataset v1/v2/v3 hashes, Dataset v3 false/zero gate, private corpus manifests/split, completed private-run baseline, normal Node generation, and M4 status; and
- aggregate reports that contain no payload bytes, private content, private metrics, absolute paths, credentials, or model artifacts.

Focused tests run first, followed by the complete relevant Stage 7 Python and Node boundary suites after the private training run ends. Operational verification re-runs Git status, private preflight, formal Dataset hashes/gate, private aggregate counts, symlink checks, and isolated-root inventory before and after every acquisition batch.

## 12. Non-goals

This design does not add or authorize:

- a general web crawler, unlimited downloads, or scraping against platform terms;
- automatic legal conclusions or substitution for qualified legal advice;
- automatic candidate promotion or automatic batch continuation;
- training on the new candidates or merging them with any existing corpus;
- Dataset v1/v2/v3 changes or Dataset v3 eligibility;
- complete-building generation, public inference, model export, or M4 Apply Mode;
- publication or redistribution of candidate payloads, derived data, metrics, checkpoints, weights, or output;
- payment, mass creator outreach, account creation, authentication bypass, or rate-limit avoidance;
- processing the existing 42 deferred oversized private buildings; or
- tiling, cropping, rescaling, or a new large-building representation.

## 13. Approval and next gates

The owner approved the high-yield-source audit route, the rights hard gate, source-relative automated ranking, a 50-card human review pilot, the isolated state model, training-time metadata-only restriction, fail-closed handling, at-least-20 pilot target, one-source/10-candidate yield proof, 95 percent parsing threshold, 10 percent duplicate ceiling, and 100-item gated expansion approach in conversation on 2026-07-16.

The next gate is owner review of this written specification. After that review, create a detailed test-driven implementation plan. Neither this specification nor its commit authorizes payload download, Dataset admission, training, processing of oversized buildings, publication, or export.
