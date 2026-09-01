import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createFrozenDesignEnvelope } from '../src/playbook/execute/designEnvelope.js';
import { loadShadowCorpus } from '../src/playbook/shadow/corpus.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const INPUT = Object.freeze({
  candidateId: 'candidate-01',
  seed: 1432164,
  prompt: 'Build a medieval residence with a readable three-volume silhouette.'
});
const SYSTEM = 'Use supplemental advisory knowledge only to shape intents; it is not reviewed rule authority and cannot appear in rule ID lists. Select design intents, reviewed rule IDs, and optional repair variant preferences from the supplied exact lists. Return no patch, path, value, coordinate, block, command, score, threshold, or extra field. Preserve candidate ID, seed, five layer rows, and canonical reviewed order.';
const REVIEWED_RULES = [
  ['rule:structure.compose-three-volumes', 'core-procedure'],
  ['rule:structure.layer-volumes-to-reduce-blankness', 'core-procedure'],
  ['rule:structure.create-primary-secondary-hierarchy', 'core-procedure'],
  ['rule:structure.keep-support-volumes-subordinate', 'core-procedure'],
  ['rule:roof.border-with-material-contrast', 'core-procedure'],
  ['rule:roof.scale-slope-to-massing', 'core-procedure'],
  ['rule:roof.break-large-flat-plane', 'core-procedure'],
  ['rule:facade.frame-before-openings', 'core-procedure'],
  ['rule:facade.offset-frame-for-depth', 'core-procedure'],
  ['rule:facade.partition-large-wall', 'core-procedure'],
  ['rule:facade.break-repetitive-bays', 'core-procedure'],
  ['rule:medieval.extend-only-needed-facades', 'core-procedure'],
  ['rule:medieval.show-load-path', 'core-procedure'],
  ['rule:medieval.align-roof-with-overhang', 'core-procedure'],
  ['rule:medieval.use-stone-base-for-height', 'core-procedure'],
  ['rule:case.join-crossed-massing-with-tower', 'case-pattern'],
  ['rule:case.repeat-motif-for-unity', 'case-pattern'],
  ['rule:case.use-greenery-as-composition', 'case-pattern'],
  ['rule:case.allocate-detail-by-viewpoint', 'case-pattern'],
  ['rule:case.balance-warm-mass-with-dark-roof', 'case-pattern'],
  ['rule:case.compose-context-depth', 'case-pattern']
].map(([rule_id, teaching_role]) => ({ rule_id, teaching_role }));
const EXECUTABLE_REPAIRS = [
  {
    repair_operation_id: 'repair:massing:resize-or-reposition-volume',
    allowed_variant_ids: ['center-primary-and-reattach-secondaries', 'differentiate-equal-secondary-scale']
  },
  {
    repair_operation_id: 'repair:massing:strengthen-primary-volume',
    allowed_variant_ids: ['promote-largest-stable', 'reduce-nondominant-secondary']
  },
  {
    repair_operation_id: 'repair:massing:reduce-support-volume-prominence',
    allowed_variant_ids: ['reduce-attached-support-scale']
  },
  {
    repair_operation_id: 'repair:structure:connect-support-path',
    allowed_variant_ids: ['connect-known-structural-anchors']
  }
];
const RESPONSE = {
  schema_version: 1,
  candidate_id: 'candidate-01',
  seed: 1432164,
  brief_intent: 'medieval-residence',
  layer_intents: [
    { layer: 'brief', intent: 'residential-brief' },
    { layer: 'massing', intent: 'three-volume-hierarchy' },
    { layer: 'structure', intent: 'visible-support-path' },
    { layer: 'roof', intent: 'roof-follows-massing' },
    { layer: 'facade', intent: 'frame-before-openings' }
  ],
  selected_rule_ids: ['rule:structure.compose-three-volumes'],
  rejected_rule_ids: [],
  repair_variant_preferences: [
    {
      repair_operation_id: 'repair:massing:strengthen-primary-volume',
      variant_id: 'promote-largest-stable'
    }
  ]
};

test('mock envelope is locally frozen with all five ordered intent rows and never reads a client', async () => {
  const cards = await reviewedCards();
  const input = { mode: 'mock', ...INPUT, cards };
  Object.defineProperty(input, 'client', {
    enumerable: true,
    get: () => { throw new Error('mock mode read client'); }
  });

  const envelope = await createFrozenDesignEnvelope(input);

  assert.deepEqual(envelope, RESPONSE);
  assert.ok(Object.isFrozen(envelope));
  assert.ok(Object.isFrozen(envelope.layer_intents));
  assert.ok(Object.isFrozen(envelope.layer_intents[0]));
  assert.ok(Object.isFrozen(envelope.repair_variant_preferences));
});

test('configured LLM receives one exact bounded packet and freezes its valid full envelope', async () => {
  const cards = await reviewedCards();
  const calls = [];
  const client = {
    name: 'private-provider',
    isConfigured: () => true,
    chatJson: async (request) => {
      calls.push(request);
      return clone(RESPONSE);
    }
  };

  const envelope = await createFrozenDesignEnvelope({ mode: 'llm', ...INPUT, cards, client });

  assert.deepEqual(envelope, RESPONSE);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    system: SYSTEM,
    user: {
      schema_version: 1,
      candidate_id: 'candidate-01',
      seed: 1432164,
      prompt_intent: 'Build a medieval residence with a readable three-volume silhouette.',
      reviewed_rules: REVIEWED_RULES,
      executable_repair_variants: EXECUTABLE_REPAIRS,
      required_layers: ['brief', 'massing', 'structure', 'roof', 'facade'],
      output_contract: {
        fields: [
          'schema_version', 'candidate_id', 'seed', 'brief_intent', 'layer_intents',
          'selected_rule_ids', 'rejected_rule_ids', 'repair_variant_preferences'
        ],
        layer_intent_fields: ['layer', 'intent'],
        layer_order: ['brief', 'massing', 'structure', 'roof', 'facade'],
        rule_id_order: REVIEWED_RULES.map((row) => row.rule_id),
        repair_variant_preference_fields: ['repair_operation_id', 'variant_id']
      }
    }
  });
  assert.ok(Object.isFrozen(calls[0].user));
});

test('LLM accepts a reviewed-corpus ordered cross-prefix rule subset and rejects its reverse', async () => {
  const cards = await reviewedCards();
  const ordered = clone(RESPONSE);
  ordered.selected_rule_ids = [
    'rule:structure.compose-three-volumes',
    'rule:roof.border-with-material-contrast'
  ];
  const reverse = clone(ordered);
  reverse.selected_rule_ids.reverse();
  const client = {
    name: 'private-provider',
    isConfigured: () => true,
    chatJson: async () => ordered
  };

  assert.deepEqual(
    await createFrozenDesignEnvelope({ mode: 'llm', ...INPUT, cards, client }),
    ordered
  );
  client.chatJson = async () => reverse;
  await assert.rejects(
    createFrozenDesignEnvelope({ mode: 'llm', ...INPUT, cards, client }),
    { code: 'P5_DESIGN_INVALID' }
  );
});

test('LLM rejects a syntactically valid fabricated 21-card corpus', async () => {
  const cards = clone(REVIEWED_RULES);
  cards[0].rule_id = 'rule:unpublished-00';
  const response = clone(RESPONSE);
  response.selected_rule_ids = ['rule:unpublished-00'];
  const client = {
    name: 'private-provider',
    isConfigured: () => true,
    chatJson: async () => response
  };

  await assert.rejects(
    createFrozenDesignEnvelope({ mode: 'llm', ...INPUT, cards, client }),
    { code: 'P5_DESIGN_INVALID', message: 'P5_DESIGN_INVALID' }
  );
});

test('LLM degrades whole candidate for every authority drift without a mock fallback', async (t) => {
  const cards = await reviewedCards();
  const mutations = [
    ['candidate id', (value) => { value.candidate_id = 'candidate-02'; }],
    ['seed', (value) => { value.seed = 1432165; }],
    ['layer order', (value) => { value.layer_intents.reverse(); }],
    ['rule order', (value) => { value.selected_rule_ids = ['rule:structure.create-primary-secondary-hierarchy', 'rule:structure.compose-three-volumes']; }],
    ['rule membership', (value) => { value.selected_rule_ids = ['rule:invented']; }],
    ['case pattern repair preference', (value) => { value.repair_variant_preferences[0] = { repair_operation_id: 'repair:case:invented', variant_id: 'invented' }; }],
    ['operation variant pair', (value) => { value.repair_variant_preferences[0].variant_id = 'center-primary-and-reattach-secondaries'; }],
    ['duplicate preference', (value) => { value.repair_variant_preferences.push(clone(value.repair_variant_preferences[0])); }],
    ['overlong brief prose', (value) => { value.brief_intent = 'x'.repeat(801); }],
    ['overlong layer prose', (value) => { value.layer_intents[0].intent = '😀'.repeat(801); }],
    ['extra envelope field', (value) => { value.patch = []; }],
    ['extra layer field', (value) => { value.layer_intents[0].coordinate = 1; }],
    ['extra preference field', (value) => { value.repair_variant_preferences[0].score = 1; }]
  ];

  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const response = clone(RESPONSE);
      mutate(response);
      let calls = 0;
      const client = {
        name: 'provider-body-must-not-leak',
        isConfigured: () => true,
        chatJson: async () => {
          calls += 1;
          return response;
        }
      };
      await assert.rejects(
        createFrozenDesignEnvelope({ mode: 'llm', ...INPUT, cards, client }),
        { code: 'P5_DESIGN_INVALID', message: 'P5_DESIGN_INVALID' }
      );
      assert.equal(calls, 1);
    });
  }
});

test('LLM configuration and request failures expose only P5_DESIGN_INVALID', async () => {
  const cards = await reviewedCards();
  for (const client of [
    { name: 'private-unconfigured', isConfigured: () => false, chatJson: async () => RESPONSE },
    { name: 'private-request', isConfigured: () => true, chatJson: async () => { throw new Error('private body'); } }
  ]) {
    await assert.rejects(
      createFrozenDesignEnvelope({ mode: 'llm', ...INPUT, cards, client }),
      { code: 'P5_DESIGN_INVALID', message: 'P5_DESIGN_INVALID' }
    );
  }
});

async function reviewedCards() {
  return (await loadShadowCorpus({ projectRoot: ROOT })).cards;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
