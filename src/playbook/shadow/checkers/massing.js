import { checkResult } from './result.js';

const NON_RESIDENTIAL_TYPOLOGY = /^(?:monument|church|temple|museum|office|commercial|public-building|public_building|industrial|infrastructure)$/u;

export function checkThreeVolumeComposition(projected) {
  const typology = projected?.brief?.typology;
  if (typeof typology !== 'string' || typology.trim() === '') return unknown('brief.typology');
  if (NON_RESIDENTIAL_TYPOLOGY.test(typology.trim().toLowerCase())) {
    return notApplicable(projected, `typology=${typology}`);
  }

  const volumes = projected?.massing?.volumes;
  if (!Array.isArray(volumes) || volumes.some((volume) => !isWellFormedBox(volume))) {
    return unknown('massing.volumes');
  }

  const primaries = volumes.filter(isPrimary);
  const primary = primaries.length === 1 ? primaries[0] : null;
  const attached = primary ? volumes.filter((volume) => isAttachedTo(volume, primary.id)) : [];
  if (
    volumes.length === 3
    && primary
    && isCentered(primary)
    && attached.length === 2
    && !allScalesEqual(volumes)
  ) return checkResult('satisfied', { evidence: [volumePointer(projected)] });

  return checkResult('violated', {
    evidence: [volumePointer(projected)],
    observations: ['three-volume-composition-not-established']
  });
}

export function checkPrimarySecondaryHierarchy(projected) {
  const typology = projected?.brief?.typology;
  if (typeof typology !== 'string' || typology.trim() === '') return unknown('brief.typology');
  if (NON_RESIDENTIAL_TYPOLOGY.test(typology.trim().toLowerCase())) {
    return notApplicable(projected, `typology=${typology}`);
  }

  const volumes = projected?.massing?.volumes;
  if (!Array.isArray(volumes) || volumes.length < 2 || volumes.some((volume) => !isWellFormedBox(volume))) {
    return unknown('massing.volumes');
  }

  const primaries = volumes.filter(isPrimary);
  if (primaries.length > 1) {
    return violated(projected, 'multiple-primary-masses');
  }
  if (primaries.length !== 1) return unknown('massing.primary_volume_id');

  const primary = primaries[0];
  if (volumes.some((volume) => !isPrimary(volume) && !isSecondary(volume))) {
    return unknown('massing.secondary_volume_ids');
  }
  const secondaries = volumes.filter((volume) => volume !== primary && isSecondary(volume));
  if (secondaries.length === 0 || secondaries.some((volume) => !isAttachedTo(volume, primary.id))) {
    return unknown('massing.secondary_volume_ids');
  }
  if (secondaries.some((volume) => scaleProduct(volume) >= scaleProduct(primary))) {
    return violated(projected, 'secondary-scale-not-lower-than-primary');
  }
  return checkResult('satisfied', { evidence: [volumePointer(projected)] });
}

export function checkSubordinateSupportVolume(projected) {
  const volumes = projected?.massing?.volumes;
  if (!Array.isArray(volumes) || volumes.some((volume) => !isObject(volume))) {
    return unknown('massing.volumes');
  }

  const attachmentFacts = volumes.map(attachmentState);
  if (attachmentFacts.includes(null)) return unknown('massing.volume_relations');
  const attached = volumes.filter((volume, index) => attachmentFacts[index] === true);
  if (attached.length === 0) {
    return checkResult('not-applicable', {
      evidence: [volumePointer(projected)],
      observations: ['attached-secondary=false']
    });
  }

  const primaries = volumes.filter(isPrimary);
  if (primaries.length !== 1 || !isPositiveScale(primaries[0]) || attached.some((volume) => !isPositiveScale(volume))) {
    return unknown('massing.primary_volume_id');
  }
  const primary = primaries[0];
  if (attached.some((volume) => volume.placement.attach_to !== primary.id)) {
    return unknown('massing.primary_volume_id');
  }
  if (attached.some((volume) => scaleProduct(volume) >= scaleProduct(primary))) {
    return violated(projected, 'support-volume-scale-not-lower-than-primary');
  }
  return checkResult('satisfied', { evidence: [volumePointer(projected)] });
}

function unknown(signal) {
  return checkResult('unknown', { missing: [signal] });
}

function notApplicable(projected, observation) {
  return checkResult('not-applicable', {
    evidence: [typologyPointer(projected)],
    observations: [observation]
  });
}

function violated(projected, observation) {
  return checkResult('violated', {
    evidence: [volumePointer(projected)],
    observations: [observation]
  });
}

function isWellFormedBox(volume) {
  return isObject(volume)
    && typeof volume.id === 'string'
    && volume.shape === 'box'
    && isPositiveScale(volume)
    && isObject(volume.placement)
    && typeof volume.placement.relation === 'string';
}

function isPositiveScale(volume) {
  return Array.isArray(volume?.scale)
    && volume.scale.length === 3
    && volume.scale.every((value) => Number.isFinite(value) && value > 0);
}

function isPrimary(volume) {
  return volume?.role === 'primary-mass'
    || volume?.purpose === 'main-building-envelope'
    || Array.isArray(volume?.tags) && volume.tags.includes('primary-mass');
}

function isSecondary(volume) {
  return volume?.role === 'secondary-mass'
    || Array.isArray(volume?.tags) && volume.tags.includes('secondary-mass');
}

function isCentered(volume) {
  return volume?.placement?.relation === 'center';
}

function isAttachedTo(volume, primaryId) {
  return attachmentState(volume) === true && volume.placement.attach_to === primaryId;
}

function attachmentState(volume) {
  if (!isObject(volume?.placement) || typeof volume.placement.relation !== 'string') return null;
  if (volume.placement.relation.startsWith('attached-')) {
    return typeof volume.placement.attach_to === 'string' && volume.placement.attach_to.length > 0;
  }
  return false;
}

function scaleProduct(volume) {
  return volume.scale.reduce((product, value) => product * value, 1);
}

function allScalesEqual(volumes) {
  const [first] = volumes;
  return volumes.every((volume) => volume.scale.every((value, index) => value === first.scale[index]));
}

function typologyPointer(projected) {
  return projected?.pointers?.brief?.typology ?? '/architecture/typology';
}

function volumePointer(projected) {
  return projected?.pointers?.massing?.volumes ?? '/architecture/volumes';
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
