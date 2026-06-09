import { findSkillById, pickSkill, skillSummaries } from '../skills/buildingSkills.js';

const SUPPORTED_MODES = new Set(['auto', 'mock', 'llm']);

export class SkillRouterAgent {
  constructor({ llmClient, mode = 'auto' }) {
    this.llmClient = llmClient;
    this.mode = SUPPORTED_MODES.has(mode) ? mode : 'auto';
  }

  async run(requirement) {
    const fallback = this.fallback(requirement);
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 建筑 skill 路由 Agent。',
            '只输出 JSON，不要解释。',
            '你要从 availableSkills 中选择最适合的 skillId，并说明 rationale。',
            '字段必须包括 skillId, confidence, rationale, emphasis。'
          ].join('\n'),
          user: JSON.stringify({
            requirement,
            availableSkills: skillSummaries()
          })
        });
        return normalizeSkillSelection(parsed, fallback, 'llm');
      } catch (error) {
        return {
          ...fallback,
          source: 'fallback-after-llm-error',
          llmError: error.message
        };
      }
    }

    return fallback;
  }

  fallback(requirement) {
    const skill = pickSkill(requirement);
    return normalizeSkillSelection({
      skillId: skill.id,
      confidence: 0.72,
      rationale: `${requirement.style} 风格和关键词匹配 ${skill.name} skill。`,
      emphasis: skill.styleMotifs
    }, undefined, 'fallback');
  }
}

function normalizeSkillSelection(value, fallback, source) {
  const raw = value && typeof value === 'object' ? value : {};
  const fallbackSkillId = fallback?.skillId || 'generic-house';
  const skill = findSkillById(raw.skillId || fallbackSkillId);
  const confidence = Number(raw.confidence ?? fallback?.confidence ?? 0.5);
  return {
    source,
    skillId: skill.id,
    name: skill.name,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    rationale: String(raw.rationale || fallback?.rationale || `使用 ${skill.name} skill。`),
    emphasis: normalizeArray(raw.emphasis, fallback?.emphasis || skill.styleMotifs),
    preferredFootprint: skill.preferredFootprint,
    styleMotifs: skill.styleMotifs,
    zoneHints: skill.zoneHints,
    requiredModules: skill.requiredModules,
    optionalModules: skill.optionalModules,
    critiqueRules: skill.critiqueRules,
    repairRules: skill.repairRules
  };
}

function normalizeArray(value, fallback) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return fallback || [];
}
