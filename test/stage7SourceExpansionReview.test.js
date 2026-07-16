import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceExpansionContractError } from '../src/construction/learning/stage7SourceExpansionContracts.js';
import {
  applyReviewDecisions,
  buildFinalReviewSummary,
  canonicalSourceExpansionJson,
  renderFinalReviewSummaryMarkdown,
  renderSourceExpansionCardsMarkdown,
  selectDiscoveryWave,
  selectYieldWave
} from '../src/construction/learning/stage7SourceExpansionReview.js';
import {
  candidateFixture,
  decisionFixture,
  rightsFixture
} from './fixtures/stage7SourceExpansionFixtures.js';

test('discovery and yield waves enforce distinct deterministic caps', () => {
  const ranked = rankedFixture({ sources: 10, candidatesPerSource: 8 });
  const discovery = selectDiscoveryWave(ranked);
  assert.equal(discovery.length, 30);
  assert.ok(maximumBySource(discovery) <= 5);
  const decisions = discovery.map((row) => decisionFixture({
    candidate_id: row.candidate_id,
    decision: 'accept'
  }));
  const yieldCards = selectYieldWave({
    ranked,
    discoveryCards: discovery,
    discoveryDecisions: decisions
  });

  assert.equal(yieldCards.length, 20);
  assert.equal(new Set([...discovery, ...yieldCards].map((row) => row.candidate_id)).size, 50);
  assert.ok(maximumBySource([...discovery, ...yieldCards]) <= 15);
  assert.equal(Object.isFrozen(discovery), true);
  assert.equal(Object.isFrozen(yieldCards), true);

  const reversed = selectDiscoveryWave([...ranked].reverse());
  assert.notDeepEqual(discovery, reversed, 'selection consumes the deterministic ranking order it is given');
});

test('discovery skips ineligible rows, obeys per-source limits, and stops short safely', () => {
  const ranked = rankedFixture({ sources: 2, candidatesPerSource: 4 });
  const withDeferred = [
    { ...ranked[0], review_eligible: false, candidate_id: 'source-99:deferred', source_id: 'source-99' },
    ...ranked
  ];
  const cards = selectDiscoveryWave(withDeferred, { limit: 30, perSource: 2 });

  assert.equal(cards.length, 4);
  assert.equal(cards.some((row) => row.candidate_id === 'source-99:deferred'), false);
  assert.equal(maximumBySource(cards), 2);
});

test('yield selects only unseen candidates from sources accepted during discovery', () => {
  const ranked = rankedFixture({ sources: 3, candidatesPerSource: 8 });
  const discovery = selectDiscoveryWave(ranked, { limit: 15, perSource: 5 });
  const decisions = discovery.map((row) => decisionFixture({
    candidate_id: row.candidate_id,
    decision: row.source_id === 'source-02' ? 'accept' : 'reject'
  }));
  const yieldCards = selectYieldWave({
    ranked,
    discoveryCards: discovery,
    discoveryDecisions: decisions
  });

  assert.equal(yieldCards.length, 3);
  assert.deepEqual(new Set(yieldCards.map((row) => row.source_id)), new Set(['source-02']));
  assert.equal(yieldCards.some((row) => discovery.includes(row)), false);

  const none = selectYieldWave({
    ranked,
    discoveryCards: discovery,
    discoveryDecisions: discovery.map((row) => decisionFixture({
      candidate_id: row.candidate_id,
      decision: 'defer'
    }))
  });
  assert.deepEqual(none, []);
  assert.equal(Object.isFrozen(none), true);
});

test('yield prioritizes accepted count, then mean discovery score, then source ID', () => {
  const ranked = rankedFixture({ sources: 3, candidatesPerSource: 8 });
  const discovery = selectDiscoveryWave(ranked, { limit: 15, perSource: 5 });
  const decisions = discovery.map((row) => {
    const accepts = row.source_id === 'source-03'
      || (row.source_id === 'source-02' && row.score >= 98)
      || (row.source_id === 'source-01' && row.score >= 98);
    return decisionFixture({
      candidate_id: row.candidate_id,
      decision: accepts ? 'accept' : 'reject'
    });
  });
  const yieldCards = selectYieldWave({
    ranked,
    discoveryCards: discovery,
    discoveryDecisions: decisions,
    limit: 4
  });

  assert.deepEqual(yieldCards.map((row) => row.source_id), [
    'source-03',
    'source-03',
    'source-03',
    'source-01'
  ]);
});

test('only the uniquely latest decision revision applies', () => {
  const [card] = rankedFixture({ sources: 1, candidatesPerSource: 1 });
  const decisions = [
    decisionFixture({ candidate_id: card.candidate_id, revision: 1, decision: 'reject' }),
    decisionFixture({ candidate_id: card.candidate_id, revision: 2, decision: 'accept' })
  ];
  const [result] = applyReviewDecisions({ cards: [card], decisions, wave: 'discovery' });

  assert.deepEqual(result, {
    candidate_id: card.candidate_id,
    source_id: card.source_id,
    decision_revision: 2,
    decision: 'accept',
    state: 'human_accepted'
  });
  assert.equal(Object.isFrozen(result), true);

  assert.throws(
    () => applyReviewDecisions({
      cards: [card],
      decisions: [decisions[1], decisions[1]],
      wave: 'discovery'
    }),
    hasCode('DECISION_REVISION_AMBIGUOUS')
  );
});

test('decision application rejects wrong-wave and outside-card decisions', () => {
  const [card] = rankedFixture({ sources: 1, candidatesPerSource: 1 });
  assert.throws(
    () => applyReviewDecisions({
      cards: [card],
      decisions: [decisionFixture({ candidate_id: card.candidate_id, wave: 'yield' })],
      wave: 'discovery'
    }),
    hasCode('DECISION_WAVE_MISMATCH')
  );
  assert.throws(
    () => applyReviewDecisions({
      cards: [card],
      decisions: [decisionFixture({ candidate_id: 'source-99:outside' })],
      wave: 'discovery'
    }),
    hasCode('DECISION_OUTSIDE_WAVE')
  );
});

test('pending, accepted, deferred, and rejected decisions map to explicit states', () => {
  const cards = rankedFixture({ sources: 1, candidatesPerSource: 4 });
  const decisions = [
    decisionFixture({ candidate_id: cards[0].candidate_id, decision: 'accept' }),
    decisionFixture({ candidate_id: cards[1].candidate_id, decision: 'defer' }),
    decisionFixture({ candidate_id: cards[2].candidate_id, decision: 'reject' })
  ];
  const results = applyReviewDecisions({ cards, decisions, wave: 'discovery' });
  const states = new Map(results.map((item) => [item.candidate_id, item.state]));

  assert.equal(states.get(cards[0].candidate_id), 'human_accepted');
  assert.equal(states.get(cards[1].candidate_id), 'deferred');
  assert.equal(states.get(cards[2].candidate_id), 'rejected');
  assert.equal(states.get(cards[3].candidate_id), 'human_review_pending');
});

test('final summary requires both twenty accepted and ten from one source', () => {
  const ranked = rankedFixture({ sources: 2, candidatesPerSource: 15 });
  const discovery = selectDiscoveryWave(ranked);
  const discoveryDecisions = discovery.map((row) => decisionFixture({
    candidate_id: row.candidate_id,
    decision: 'accept'
  }));
  const yieldCards = selectYieldWave({ ranked, discoveryCards: discovery, discoveryDecisions });
  const yieldDecisions = yieldCards.map((row) => decisionFixture({
    candidate_id: row.candidate_id,
    wave: 'yield',
    decision: 'accept'
  }));
  const summary = buildFinalReviewSummary({
    discovery,
    yieldCards,
    discoveryDecisions,
    yieldDecisions
  });

  assert.equal(summary.metadata_only, true);
  assert.equal(summary.authorizes_download, false);
  assert.equal(summary.authorizes_training, false);
  assert.equal(summary.accepted_count, 30);
  assert.equal(summary.has_twenty_accepted, true);
  assert.equal(summary.has_ten_from_one_source, true);
  assert.equal(summary.ready_for_acquisition_design_review, true);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.states), true);
});

test('final summary remains closed when either readiness threshold is missing', () => {
  const discovery = rankedFixture({ sources: 10, candidatesPerSource: 2 });
  const accepted = discovery.map((row) => decisionFixture({
    candidate_id: row.candidate_id,
    decision: 'accept'
  }));
  const summary = buildFinalReviewSummary({
    discovery,
    yieldCards: [],
    discoveryDecisions: accepted,
    yieldDecisions: []
  });

  assert.equal(summary.accepted_count, 20);
  assert.equal(summary.has_twenty_accepted, true);
  assert.equal(summary.has_ten_from_one_source, false);
  assert.equal(summary.ready_for_acquisition_design_review, false);
});

test('Markdown links to public pages without copying images or authorizing use', () => {
  const [base] = rankedFixture({ sources: 1, candidatesPerSource: 1 });
  const candidate = candidateFixture({
    ...base.candidate,
    title: 'Synthetic [label](target)|!',
    author: 'author_*',
    public_dimensions: { x: 40, y: 32, z: 48 }
  });
  const card = { ...base, candidate };
  const rights = rightsFixture({
    candidate_id: card.candidate_id,
    scope: 'uniform-family',
    revision: 3,
    conditions: ['Attribution required'],
    reason_codes: ['HUMAN_REVIEWED']
  });
  const markdown = renderSourceExpansionCardsMarkdown({
    wave: 'discovery',
    cards: [card],
    rightsByCandidate: new Map([[card.candidate_id, rights]])
  });

  assert.match(markdown, /\[Public preview\]\(https:\/\//u);
  assert.match(markdown, /\[Canonical source\]\(https:\/\//u);
  assert.doesNotMatch(markdown, /!\[/u);
  assert.match(markdown, /Accept \/ Defer \/ Reject/u);
  assert.match(markdown, /uniform\\-family/u);
  assert.match(markdown, /Attribution required/u);
  assert.match(markdown, /does not authorize download, Dataset admission, or training/iu);
  assert.doesNotMatch(markdown, /\[label\]\(target\)/u);
});

test('canonical JSON and final Markdown are deterministic metadata-only renderings', () => {
  assert.equal(
    canonicalSourceExpansionJson({ z: 1, a: { d: 2, c: 3 }, list: [{ b: 2, a: 1 }] }),
    '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "list": [\n    {\n      "a": 1,\n      "b": 2\n    }\n  ],\n  "z": 1\n}\n'
  );
  const summary = buildFinalReviewSummary({
    discovery: [],
    yieldCards: [],
    discoveryDecisions: [],
    yieldDecisions: []
  });
  const markdown = renderFinalReviewSummaryMarkdown(summary);
  assert.match(markdown, /Metadata only: yes/u);
  assert.match(markdown, /Authorizes download: no/u);
  assert.match(markdown, /Authorizes training: no/u);
  assert.match(markdown, /\| none \| 0 \|/u);
  assert.match(markdown, /does not authorize download, Dataset admission, or training/iu);
});

function rankedFixture({ sources = 10, candidatesPerSource = 8 } = {}) {
  const rows = [];
  for (let source = 1; source <= sources; source += 1) {
    for (let item = 1; item <= candidatesPerSource; item += 1) {
      const sourceId = `source-${String(source).padStart(2, '0')}`;
      const assetId = `item-${String(item).padStart(2, '0')}`;
      const candidate = candidateFixture({
        candidate_id: `${sourceId}:${assetId}`,
        source_id: sourceId,
        asset_id: assetId,
        title: `Synthetic ${sourceId} ${assetId}`
      });
      rows.push(Object.freeze({
        candidate_id: candidate.candidate_id,
        source_id: sourceId,
        candidate,
        score: 100 - item,
        coverage: 100,
        lane: 'ranked',
        review_eligible: true,
        percentiles: { popularity: 1 - item / 100, reception: 1 - item / 100 },
        duplicate_penalty: 0
      }));
    }
  }
  return Object.freeze(rows.sort((left, right) =>
    right.score - left.score || left.candidate_id.localeCompare(right.candidate_id)
  ));
}

function maximumBySource(rows) {
  return Math.max(0, ...countBySource(rows).values());
}

function countBySource(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.source_id, (counts.get(row.source_id) || 0) + 1);
  return counts;
}

function hasCode(code) {
  return (error) => error instanceof SourceExpansionContractError && error.code === code;
}
