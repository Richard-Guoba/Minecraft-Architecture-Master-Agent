const frozen = (values) => Object.freeze([...values]);

export const RESOURCE_SCHEMA_VERSION = 1;
export const SOURCE_TYPES = frozen([
  'case-catalog', 'author-course', 'collective-reference',
  'video-platform', 'mixed-resource-platform'
]);
export const CREATOR_MODELS = frozen([
  'single-author', 'multi-creator', 'collective-editorial', 'unknown'
]);
export const ACCESS_OBSERVATION_STATUSES = frozen([
  'observed-available', 'observed-unavailable', 'requires-login',
  'restricted', 'not-reviewed', 'unknown', 'not-applicable'
]);
export const AVAILABILITY_STATUSES = frozen([
  'reachable', 'partial-js-render', 'manual-or-api-review-required',
  'source-unavailable', 'unknown'
]);
export const RIGHTS_STATUSES = frozen([
  'observed-allowed', 'observed-prohibited', 'not-reviewed',
  'unknown', 'not-applicable'
]);
export const LIFECYCLE_STATUSES = frozen([
  'registered', 'probing', 'assessed',
  'approved-for-intake', 'deferred', 'rejected'
]);
export const RECOMMENDATIONS = frozen([
  'recommend-approve', 'recommend-defer', 'recommend-reject'
]);
export const OBSERVATION_BASES = frozen([
  'direct-page', 'site-claim', 'search-index',
  'project-inference', 'unverified'
]);
export const RATING_DIMENSIONS = frozen([
  'principles', 'construction_sequence', 'reference_case', 'materials',
  'survival_constraints', 'evaluation', 'provenance',
  'access_stability', 'rights_clarity'
]);
export const DECISIONS = frozen(['approved-for-intake', 'deferred', 'rejected']);
