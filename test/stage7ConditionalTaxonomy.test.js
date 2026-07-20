import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILDING_TYPE_PARENTS,
  COMPLETENESS_VALUES,
  CONDITIONAL_ADMISSION_SCHEMA_VERSION,
  ConditionalAdmissionContractError,
  PRIMARY_FUNCTIONS,
  deriveScaleBin,
  conditionSupportFloor,
  resolveSupportedBuildingCondition,
  validateTaxonomyAssessment
} from '../src/construction/learning/stage7ConditionalTaxonomy.js';
import { taxonomyAssessmentFixture } from './fixtures/stage7ConditionalAdmissionFixtures.js';

function hasCode(code) {
  return (error) => error instanceof ConditionalAdmissionContractError
    && error.code === code;
}

test('accepted complete assessment validates, normalizes arrays, and deeply freezes', () => {
  const input = taxonomyAssessmentFixture({
    secondary_functions: ['residential'],
    style_tags: ['rustic', 'fantasy']
  });
  const result = validateTaxonomyAssessment(input);
  assert.equal(CONDITIONAL_ADMISSION_SCHEMA_VERSION, 1);
  assert.equal(result.building_type_parent, BUILDING_TYPE_PARENTS.castle);
  assert.deepEqual(result.style_tags, ['fantasy', 'rustic']);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.style_tags), true);
  input.style_tags.push('gothic');
  assert.deepEqual(result.style_tags, ['fantasy', 'rustic']);
});

test('controlled vocabularies contain the approved primary functions and completeness values', () => {
  assert.deepEqual(PRIMARY_FUNCTIONS, [
    'residential', 'religious_public', 'defensive_military',
    'production_agriculture', 'transport_infrastructure',
    'exploration_challenge', 'monument_ruin', 'fantastical_special'
  ]);
  assert.deepEqual(COMPLETENESS_VALUES, ['complete', 'module', 'fragment']);
});

test('accepted assessments refuse incomplete and low-confidence records', () => {
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({ completeness: 'module' })),
    hasCode('ASSESSMENT_ACCEPT_INVALID')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({ label_confidence: 'low' })),
    hasCode('ASSESSMENT_ACCEPT_INVALID')
  );
});

test('deferred and rejected assessments require reason codes', () => {
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', reason_codes: []
    })),
    hasCode('ASSESSMENT_REASON_REQUIRED')
  );
  const deferred = validateTaxonomyAssessment(taxonomyAssessmentFixture({
    assessment_decision: 'defer', completeness: 'module',
    reason_codes: ['INCOMPLETE_MODULE']
  }));
  assert.equal(deferred.assessment_decision, 'defer');
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', completeness: 'module',
      reason_codes: ['QUALITY_REJECTED']
    })),
    hasCode('ASSESSMENT_REASON_MISMATCH')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'reject', completeness: 'module',
      reason_codes: ['INCOMPLETE_MODULE']
    })),
    hasCode('ASSESSMENT_DEFER_REQUIRED')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      assessment_decision: 'defer', reason_codes: ['FREE_TEXT_REASON']
    })),
    hasCode('ASSESSMENT_VALUE_INVALID')
  );
});

test('assessment rejects unknown keys, duplicate tags, primary-as-secondary, and wrong type parent', () => {
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({ unexpected: true })),
    hasCode('ASSESSMENT_KEYS_INVALID')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      secondary_functions: ['residential', 'residential']
    })),
    hasCode('ASSESSMENT_ARRAY_DUPLICATE')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      secondary_functions: ['defensive_military']
    })),
    hasCode('ASSESSMENT_FUNCTION_DUPLICATE')
  );
  assert.throws(
    () => validateTaxonomyAssessment(taxonomyAssessmentFixture({
      building_type_parent: 'dwelling'
    })),
    hasCode('BUILDING_TYPE_PARENT_MISMATCH')
  );
});

test('scale bins and rare-condition floors are exact', () => {
  assert.equal(deriveScaleBin({ x: 24, y: 10, z: 20 }), 'compact');
  assert.equal(deriveScaleBin({ x: 25, y: 10, z: 20 }), 'standard');
  assert.equal(deriveScaleBin({ x: 41, y: 10, z: 20 }), 'large');
  assert.throws(() => deriveScaleBin({ x: 65, y: 1, z: 1 }), hasCode('DIMENSIONS_INVALID'));
  assert.equal(conditionSupportFloor(100), 5);
  assert.equal(conditionSupportFloor(500), 10);
  assert.equal(conditionSupportFloor(2000), 20);
  assert.throws(() => conditionSupportFloor(101), hasCode('SNAPSHOT_TIER_INVALID'));
  assert.deepEqual(resolveSupportedBuildingCondition({
    buildingType: 'castle', trainingSupport: 4, snapshotTier: 100
  }), {
    building_type: 'castle', parent_condition: 'fortification',
    active_condition: 'fortification', fell_back_to_parent: true,
    support_floor: 5, training_support: 4
  });
  assert.deepEqual(resolveSupportedBuildingCondition({
    buildingType: 'castle', trainingSupport: 5, snapshotTier: 100
  }), {
    building_type: 'castle', parent_condition: 'fortification',
    active_condition: 'castle', fell_back_to_parent: false,
    support_floor: 5, training_support: 5
  });
});
