import fs from 'node:fs/promises';

export const DEFAULT_TAG_TAXONOMY = Object.freeze({
  schema_version: 1,
  groups: {
    typology: ['house', 'castle', 'tower', 'temple', 'public-building', 'arena', 'scene-building'],
    style: ['modern', 'medieval', 'japanese', 'classical', 'gothic', 'coastal', 'rustic', 'fantasy', 'general'],
    site: ['flat', 'terrain-integrated', 'garden', 'water-edge', 'courtyard', 'forest', 'urban', 'island', 'slope'],
    massing: ['compact-block', 'long-bar', 'asymmetric-wings', 'balanced-axis', 'courtyard-or-void', 'vertical-landmark', 'stepped-terraces'],
    roof: ['flat-terrace', 'tower-cap', 'layered-eaves', 'deep-overhang', 'stepped-roofline', 'pitched-roof'],
    facade: ['large-glass', 'formal-symmetry', 'vertical-slots', 'micro-depth-trim', 'rail-balcony', 'lit-depth-points'],
    interior: ['furnished', 'room-layout-rich', 'furniture-pattern-rich', 'study-library', 'vertical-circulation', 'sparse-interior'],
    quality: ['high-value-reference', 'needs-scale-normalization', 'research-only', 'review-before-deep-mining', 'exterior-only'],
    room_types: ['living', 'kitchen', 'bedroom', 'bathroom', 'study', 'storage', 'workshop', 'corridor-or-gallery', 'entry-or-lobby', 'tower-room', 'chapel-or-ceremonial-hall']
  }
});

export async function loadTagTaxonomy(filePath) {
  if (!filePath) return cloneTaxonomy(DEFAULT_TAG_TAXONOMY);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return normalizeTaxonomy(parsed);
  } catch (error) {
    if (error.code === 'ENOENT') return cloneTaxonomy(DEFAULT_TAG_TAXONOMY);
    throw error;
  }
}

export function validateTagRecord(tag = {}, taxonomy = DEFAULT_TAG_TAXONOMY) {
  const group = String(tag.group || '').trim();
  const id = String(tag.id || '').trim();
  const allowed = taxonomy.groups?.[group] || [];
  if (!group || !id) return { ok: false, error: 'tag requires group and id' };
  if (!allowed.includes(id)) return { ok: false, error: `unknown tag ${group}:${id}` };
  return {
    ok: true,
    normalized: {
      group,
      id,
      label: tag.label || id.replaceAll('-', ' '),
      confidence: clamp01(tag.confidence === undefined ? 1 : tag.confidence),
      source: tag.source || 'manual',
      evidence: tag.evidence || ''
    }
  };
}

function normalizeTaxonomy(value = {}) {
  const groups = {};
  for (const [group, ids] of Object.entries(value.groups || {})) {
    groups[group] = [...new Set((ids || []).map((item) => String(item).trim()).filter(Boolean))].sort();
  }
  return {
    schema_version: Number(value.schema_version || 1),
    groups
  };
}

function cloneTaxonomy(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(1, parsed));
}
