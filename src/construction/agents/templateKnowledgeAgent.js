import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ANALYSIS_FILE = path.join('mc_templates', 'analysis', 'template_index.json');

export class TemplateKnowledgeAgent {
  constructor({ cwd = process.cwd(), analysisFile = DEFAULT_ANALYSIS_FILE } = {}) {
    this.cwd = cwd;
    this.analysisFile = path.resolve(cwd, analysisFile);
  }

  run(prompt = '', architecture = {}, buildSpec = {}) {
    const corpus = this.loadCorpus();
    if (!corpus?.templates?.length) return inactiveKnowledge('template corpus not found or empty');

    const scored = corpus.templates
      .map((template) => ({ template, score: scoreTemplate(template, prompt, architecture, buildSpec) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.template.quality - a.template.quality)
      .slice(0, 6);

    if (!scored.length) return inactiveKnowledge('no matching templates');
    const retrieved = scored.map(({ template, score }) => compactTemplate(template, score));
    const recommendations = summarizeRecommendations(retrieved, corpus.corpus);
    return {
      source: 'local-template-knowledge-agent',
      active: true,
      analysis_file: path.relative(this.cwd, this.analysisFile).replaceAll('\\', '/'),
      corpus_size: corpus.templates.length,
      retrieved,
      recommendations,
      gap_priorities: corpus.corpus?.gap_priorities || []
    };
  }

  loadCorpus() {
    if (!fs.existsSync(this.analysisFile)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(this.analysisFile, 'utf8'));
    } catch {
      return undefined;
    }
  }
}

function inactiveKnowledge(reason) {
  return {
    source: 'local-template-knowledge-agent',
    active: false,
    reason,
    retrieved: [],
    recommendations: {
      terrain_profile: 'unknown',
      landscape_features: [],
      detail_density: 'unknown',
      design_priorities: []
    },
    gap_priorities: []
  };
}

function scoreTemplate(template, prompt, architecture, buildSpec) {
  const text = `${prompt} ${architecture.style || ''} ${architecture.style_family || ''} ${architecture.typology || ''} ${buildSpec.typology || ''}`.toLowerCase();
  const fields = [
    template.title,
    template.category,
    template.style_family,
    template.typology,
    ...(template.tags || []),
    ...(template.recommendations?.source_keywords || [])
  ].join(' ').toLowerCase();
  let score = 0;
  if (template.style_family && text.includes(String(template.style_family).toLowerCase())) score += 10;
  if (template.typology && text.includes(String(template.typology).toLowerCase())) score += 8;
  if (String(template.category || '').toLowerCase().includes('house') && /house|home|住宅|房|别墅|庄园/.test(text)) score += 4;
  if (String(template.category || '').toLowerCase().includes('castle') && /castle|城堡|堡垒|哥特|中世纪/.test(text)) score += 6;
  if (String(template.category || '').toLowerCase().includes('temple') && /temple|庙|神庙|日式|pagoda|塔/.test(text)) score += 6;
  if (String(template.category || '').toLowerCase().includes('tower') && /tower|塔|高楼|钟楼|灯塔/.test(text)) score += 6;
  for (const token of keywordTokens(text)) {
    if (fields.includes(token)) score += 1.5;
  }
  if (template.analysis?.terrain?.integrated && /地形|山|洞|湖|海|水|悬崖|花园|庭院|terrain|garden|cave|lake|coast|cliff/i.test(text)) score += 3;
  if (template.recommendations?.detail_density === 'high') score += 1;
  return score;
}

function compactTemplate(template, score) {
  return {
    file: template.file,
    title: template.title,
    score,
    style_family: template.style_family,
    typology: template.typology,
    tags: template.tags || [],
    dimensions: template.analysis?.dimensions,
    terrain: template.analysis?.terrain,
    detail_metrics: template.analysis?.detail_metrics,
    top_blocks: (template.analysis?.top_blocks || []).slice(0, 8),
    recommendations: template.recommendations || {}
  };
}

function summarizeRecommendations(retrieved, corpus = {}) {
  const weighted = (selector) => retrieved.reduce((sum, item) => sum + (selector(item) ? item.score : 0), 0);
  const totalScore = retrieved.reduce((sum, item) => sum + item.score, 0) || 1;
  const landscapeFeatures = new Set();
  const designPriorities = new Set();
  const styles = new Map();
  const typologies = new Map();
  let detailScore = 0;

  for (const item of retrieved) {
    styles.set(item.style_family, (styles.get(item.style_family) || 0) + item.score);
    typologies.set(item.typology, (typologies.get(item.typology) || 0) + item.score);
    for (const feature of item.recommendations?.landscape_features || []) landscapeFeatures.add(feature);
    for (const priority of item.recommendations?.design_priorities || []) designPriorities.add(priority);
    detailScore += detailWeight(item.recommendations?.detail_density) * item.score;
  }

  const terrainWeight = weighted((item) => item.terrain?.integrated || item.terrain?.non_flat || item.tags?.includes('terrain-integrated')) / totalScore;
  const gardenWeight = weighted((item) => item.tags?.includes('landscape-composition') || item.detail_metrics?.garden_signal !== 'none') / totalScore;
  const waterWeight = weighted((item) => item.tags?.includes('water-edge')) / totalScore;
  if (terrainWeight > 0.25) landscapeFeatures.add('layered-terrain');
  if (gardenWeight > 0.25) landscapeFeatures.add('garden-composition');
  if (waterWeight > 0.2) landscapeFeatures.add('water-edge');

  return {
    style_family: topWeighted(styles),
    typology: topWeighted(typologies),
    terrain_profile: terrainWeight > 0.45 ? 'non-flat-integrated' : terrainWeight > 0.2 ? 'landscape-integrated' : 'flat-or-built-platform',
    terrain_weight: round(terrainWeight),
    garden_weight: round(gardenWeight),
    water_weight: round(waterWeight),
    landscape_features: [...landscapeFeatures].sort(),
    detail_density: detailScore / totalScore > 2.35 ? 'high' : detailScore / totalScore > 1.45 ? 'medium' : 'low',
    design_priorities: [...designPriorities].slice(0, 8),
    corpus_gap_priorities: corpus.gap_priorities || []
  };
}

export function applyTemplateKnowledgeToArchitecture(architecture = {}, templateKnowledge = {}) {
  if (!templateKnowledge.active) {
    return {
      ...architecture,
      template_knowledge: templateKnowledge
    };
  }

  const recommendations = templateKnowledge.recommendations || {};
  const features = new Set(recommendations.landscape_features || []);
  return {
    ...architecture,
    template_knowledge: templateKnowledge,
    site_rules: {
      ...(architecture.site_rules || {}),
      template_terrain_profile: recommendations.terrain_profile,
      template_landscape_features: [...features],
      template_guided_site: true,
      terrain_layers: features.has('layered-terrain') || recommendations.terrain_profile !== 'flat-or-built-platform',
      rock_base: features.has('rock-and-earth-base') || features.has('layered-terrain'),
      garden_composition: features.has('garden-composition'),
      water_feature: Boolean((architecture.site_rules || {}).water_feature || features.has('water-edge')),
      planting_beds: Boolean((architecture.site_rules || {}).planting_beds || features.has('garden-composition') || features.has('tree-and-shrub-clusters'))
    },
    detail_rules: {
      ...(architecture.detail_rules || {}),
      template_detail_density: recommendations.detail_density,
      template_design_priorities: recommendations.design_priorities || []
    },
    generation_hints: {
      ...(architecture.generation_hints || {}),
      template_knowledge_active: true,
      template_retrieved: templateKnowledge.retrieved?.map((item) => item.title) || [],
      template_gap_priorities: templateKnowledge.gap_priorities || []
    }
  };
}

export function applyTemplateKnowledgeToBuildSpec(buildSpec = {}, templateKnowledge = {}) {
  if (!templateKnowledge.active) return buildSpec;
  const recommendations = templateKnowledge.recommendations || {};
  const needsSiteDepth = recommendations.terrain_profile !== 'flat-or-built-platform' ||
    (recommendations.landscape_features || []).some((item) => ['garden-composition', 'water-edge', 'layered-terrain'].includes(item));
  const gardenDepth = needsSiteDepth ? Math.max(Number(buildSpec.garden_depth || 0), 10) : buildSpec.garden_depth;
  return {
    ...buildSpec,
    garden_depth: gardenDepth,
    lot: {
      ...(buildSpec.lot || {}),
      depth: (buildSpec.lot?.depth || buildSpec.depth || 0) + Math.max(0, gardenDepth - Number(buildSpec.garden_depth || 0))
    },
    site: {
      ...(buildSpec.site || {}),
      template_terrain_profile: recommendations.terrain_profile,
      template_landscape_features: recommendations.landscape_features || []
    },
    template_knowledge: {
      active: true,
      retrieved_count: templateKnowledge.retrieved?.length || 0,
      recommendations
    }
  };
}

function keywordTokens(text) {
  return [...new Set(String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .filter((item) => item.length >= 3)
    .slice(0, 24))];
}

function detailWeight(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

function topWeighted(map) {
  return [...map.entries()]
    .filter(([key]) => key && key !== 'undefined')
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
