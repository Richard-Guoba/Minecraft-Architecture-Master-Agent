import { checkResult } from './result.js';

const NON_MEDIEVAL_STYLE_FAMILY = /^(?:modern|classical|industrial|cyberpunk|alpine|coastal|contemporary)$/u;

export function checkVisibleLoadPath(projected) {
  const styleFamily = projected?.brief?.style_family;
  const style = projected?.brief?.style;
  if (typeof styleFamily !== 'string' || styleFamily.trim() === '') {
    return checkResult('unknown', { missing: ['brief.style_family'] });
  }
  if (NON_MEDIEVAL_STYLE_FAMILY.test(styleFamily.trim().toLowerCase())) {
    return checkResult('not-applicable', {
      evidence: [stylePointer(projected)],
      observations: [`style_family=${styleFamily}`]
    });
  }
  if (!isMedieval(styleFamily) && !isMedieval(style)) {
    return checkResult('unknown', { missing: ['brief.medieval_applicability'] });
  }

  const floorCount = projected?.structure?.structural_intent?.floor_count;
  const overhang = projected?.roof?.overhang;
  if (floorCount === 1 && overhang === 0) {
    return checkResult('not-applicable', {
      evidence: [structuralIntentPointer(projected), overhangPointer(projected)],
      observations: ['floor_count=1', 'roof.overhang=0']
    });
  }

  const paths = projected?.structure?.load_paths;
  if (paths === null || paths === undefined) {
    return checkResult('unknown', { missing: ['structure.load_paths'] });
  }
  if (!Array.isArray(paths) || paths.length === 0 || paths.some((path) => !isCompletePath(path))) {
    return checkResult('violated', {
      evidence: [loadPathPointer(projected)],
      observations: ['load-path-missing-or-broken']
    });
  }
  return checkResult('satisfied', { evidence: [loadPathPointer(projected)] });
}

function isMedieval(value) {
  return typeof value === 'string' && value.trim().toLowerCase().includes('medieval');
}

function isCompletePath(path) {
  return isObject(path)
    && hasText(path.from)
    && hasText(path.through)
    && hasText(path.to);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stylePointer(projected) {
  return projected?.pointers?.brief?.style_family ?? '/architecture/style_family';
}

function structuralIntentPointer(projected) {
  return projected?.pointers?.structure?.structural_intent ?? '/structure/structural_intent';
}

function overhangPointer(projected) {
  return projected?.pointers?.roof?.overhang ?? '/roof/overhang';
}

function loadPathPointer(projected) {
  return projected?.pointers?.structure?.load_paths ?? '/structure/load_paths';
}
