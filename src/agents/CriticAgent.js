const SUPPORTED_MODES = new Set(['auto', 'mock', 'llm']);

export class CriticAgent {
  constructor({ llmClient, mode = 'auto' }) {
    this.llmClient = llmClient;
    this.mode = SUPPORTED_MODES.has(mode) ? mode : 'auto';
  }

  async run({ requirement, skill, plan, design, blueprint, validation, repaired = false }) {
    const fallback = this.fallback({ requirement, skill, plan, design, blueprint, validation, repaired });
    if (this.mode === 'mock') return fallback;

    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 建筑评审 Agent。',
            '只输出 JSON，不要解释。',
            '你要评价建筑是否满足用户需求、skill 风格、空间功能和视觉辨识度。',
            '字段必须包括 score, strengths, issues, repairHints, needsRepair。',
            'repairHints 可包含 forceFootprint, addModules, styleMotifs, enable, elementOverrides。'
          ].join('\n'),
          user: JSON.stringify({
            requirement,
            skill,
            plan,
            design: compactDesign(design),
            blueprintStats: {
              modules: blueprint.modules,
              agents: blueprint.agents,
              operationCount: blueprint.operations?.length || 0
            },
            validation
          })
        });
        return normalizeCritique(parsed, fallback, 'llm');
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

  fallback({ requirement, skill, plan, design, blueprint, validation, repaired }) {
    const issues = [];
    const strengths = [];
    const repairHints = {
      addModules: [],
      styleMotifs: [],
      enable: [],
      elementOverrides: {}
    };
    let score = 100;

    if (validation.errors.length) {
      score -= 30;
      issues.push('硬校验未通过，数据包可能无法稳定执行。');
    }
    if (validation.warnings.length) score -= Math.min(12, validation.warnings.length * 3);

    const modules = blueprint.modules || {};
    const motifs = new Set(plan?.styleMotifs || []);
    for (const module of skill?.critiqueRules?.requiredModules || []) {
      if (!modules[module]) {
        score -= 10;
        issues.push(`缺少 ${skill.name} skill 期望的 ${module} 模块。`);
        repairHints.addModules.push(module);
      } else {
        strengths.push(`已生成 ${module} 模块。`);
      }
    }

    for (const motif of skill?.critiqueRules?.requiredMotifs || []) {
      if (!motifs.has(motif)) {
        score -= 6;
        issues.push(`语义规划缺少 ${motif} 风格母题。`);
        repairHints.styleMotifs.push(motif);
      }
    }

    if ((requirement.features || []).includes('水景') && !modules.water_feature) {
      score -= 12;
      issues.push('用户要求水景，但蓝图没有生成 water_feature。');
      repairHints.addModules.push('water_feature');
      repairHints.enable.push('waterFeature');
    }

    if (/现代/.test(requirement.style) && design.elements?.roof?.style !== 'flat') {
      score -= 8;
      issues.push('现代风格更适合平屋顶表达。');
      repairHints.elementOverrides.roof = { style: 'flat' };
    }

    if (/现代/.test(requirement.style) && (design.elements?.window?.width || 0) < 4) {
      score -= 8;
      issues.push('现代风格窗户尺寸偏小，大玻璃特征不明显。');
      repairHints.elementOverrides.window = { width: 4, height: 3 };
    }

    if (/江南|中式/.test(requirement.style) && plan?.footprint?.type !== 'courtyard') {
      score -= 12;
      issues.push('江南/中式风格缺少庭院型 footprint。');
      repairHints.forceFootprint = 'courtyard';
    }

    if (/欧式/.test(requirement.style) && !modules.chimney) {
      score -= 8;
      issues.push('欧式住宅缺少烟囱，立面识别度偏弱。');
      repairHints.addModules.push('chimney');
      repairHints.enable.push('chimney');
    }

    if (!blueprint.agents?.layout?.rooms?.length) {
      score -= 12;
      issues.push('室内功能区没有落地，建筑仍像空壳。');
      repairHints.enable.push('interior');
    } else {
      strengths.push(`已生成 ${blueprint.agents.layout.rooms.length} 个室内功能区。`);
    }

    const minimumScore = skill?.critiqueRules?.minimumScore || 75;
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return normalizeCritique({
      score: finalScore,
      strengths: strengths.length ? strengths : ['建筑通过基础结构生成和硬校验。'],
      issues: issues.length ? issues : ['未发现明显软质量问题。'],
      repairHints,
      needsRepair: !repaired && finalScore < minimumScore
    }, undefined, 'fallback');
  }
}

function compactDesign(design) {
  return {
    id: design.id,
    style: design.style,
    floors: design.floors,
    dimensions: design.dimensions,
    elements: design.elements,
    modules: design.modules,
    skill: design.skill,
    plan: design.plan
  };
}

function normalizeCritique(value, fallback, source) {
  const raw = value && typeof value === 'object' ? value : {};
  const score = Number(raw.score ?? fallback?.score ?? 0);
  const repairHints = raw.repairHints && typeof raw.repairHints === 'object' ? raw.repairHints : fallback?.repairHints || {};
  return {
    source,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    strengths: normalizeArray(raw.strengths, fallback?.strengths),
    issues: normalizeArray(raw.issues, fallback?.issues),
    repairHints: {
      forceFootprint: repairHints.forceFootprint,
      addModules: normalizeArray(repairHints.addModules, []),
      styleMotifs: normalizeArray(repairHints.styleMotifs, []),
      enable: normalizeArray(repairHints.enable, []),
      elementOverrides: repairHints.elementOverrides && typeof repairHints.elementOverrides === 'object'
        ? repairHints.elementOverrides
        : {}
    },
    needsRepair: raw.needsRepair ?? fallback?.needsRepair ?? false
  };
}

function normalizeArray(value, fallback = []) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value) return [String(value)];
  return fallback || [];
}
