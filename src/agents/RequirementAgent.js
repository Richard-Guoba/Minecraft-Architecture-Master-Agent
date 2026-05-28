const SUPPORTED_MODES = new Set(['auto', 'mock', 'llm']);

export class RequirementAgent {
  constructor({ llmClient, mode = 'auto' }) {
    this.llmClient = llmClient;
    this.mode = SUPPORTED_MODES.has(mode) ? mode : 'auto';
  }

  async run(prompt) {
    const fallback = this.fallback(prompt);

    if (this.mode === 'mock') return fallback;
    if (this.mode === 'llm' || (this.mode === 'auto' && this.llmClient?.isConfigured())) {
      try {
        const parsed = await this.llmClient.chatJson({
          system: [
            '你是 Minecraft 建筑需求解析 Agent。',
            '只输出 JSON，不要输出解释。',
            '字段必须包括 style, scale, floors, features, materials, constraints, notes。',
            'features 和 materials 必须是字符串数组。floors 必须是数字。'
          ].join('\n'),
          user: `解析这个建房需求，用中文短词填充字段：${prompt}`
        });
        return normalizeRequirement(prompt, parsed, 'llm');
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

  fallback(prompt) {
    const text = prompt.toLowerCase();
    const isEuropean = /欧式|欧洲|古典|城堡|尖顶|庄园/.test(prompt);
    const isLarge = /大|大型|豪华|庄园|别墅/.test(prompt);
    const floorsMatch = prompt.match(/([一二三四五两2-5])\s*层/);

    const floors = floorsMatch ? parseChineseNumber(floorsMatch[1]) : (isLarge ? 2 : 1);
    const features = new Set();
    if (isEuropean) {
      features.add('尖顶');
      features.add('烟囱');
      features.add('对称窗户');
    }
    if (/花园|庭院|院子/.test(prompt) || isLarge) features.add('小花园');
    if (/玻璃|窗/.test(prompt) || isEuropean) features.add('玻璃窗');
    if (/阳台/.test(prompt)) features.add('阳台');
    if (/喷泉/.test(prompt)) features.add('喷泉');

    return normalizeRequirement(prompt, {
      style: isEuropean ? '欧式' : '现代',
      scale: isLarge ? 'large' : 'medium',
      floors,
      features: [...features],
      materials: isEuropean
        ? ['smooth_sandstone', 'stone_bricks', 'dark_oak_planks', 'glass']
        : ['quartz_block', 'stone_bricks', 'glass'],
      constraints: ['Minecraft Java 1.21', '单人创造超平坦世界', '使用数据包函数执行'],
      notes: ['未配置大模型时使用规则模板解析。']
    }, 'fallback');
  }
}

function normalizeRequirement(prompt, value, source) {
  const floors = Number(value.floors);
  return {
    source,
    prompt,
    style: String(value.style || '欧式'),
    scale: String(value.scale || 'large'),
    floors: Number.isFinite(floors) ? Math.max(1, Math.min(3, Math.round(floors))) : 2,
    features: normalizeArray(value.features),
    materials: normalizeArray(value.materials),
    constraints: normalizeArray(value.constraints),
    notes: normalizeArray(value.notes)
  };
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return [String(value)];
}

function parseChineseNumber(value) {
  const map = new Map([
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5]
  ]);
  return map.get(value) || Number(value) || 2;
}
