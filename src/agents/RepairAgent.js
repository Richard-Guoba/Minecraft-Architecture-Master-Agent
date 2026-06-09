export class RepairAgent {
  run({ requirement, skill, plan, critique }) {
    if (!critique?.needsRepair) {
      return {
        applied: false,
        actions: [],
        requirement,
        plan
      };
    }

    const actions = [];
    const repairedRequirement = clone(requirement);
    const repairedPlan = clone(plan);
    const hints = critique.repairHints || {};
    const repairRules = skill?.repairRules || {};

    const forceFootprint = hints.forceFootprint || repairRules.forceFootprint;
    if (forceFootprint && repairedPlan.footprint?.type !== forceFootprint) {
      repairedPlan.footprint = {
        ...(repairedPlan.footprint || {}),
        type: forceFootprint,
        source: 'repair'
      };
      actions.push(`footprint -> ${forceFootprint}`);
    }

    const motifs = new Set(repairedPlan.styleMotifs || []);
    for (const motif of [...(repairRules.addMotifs || []), ...(hints.styleMotifs || [])]) {
      if (!motifs.has(motif)) {
        motifs.add(motif);
        actions.push(`add motif ${motif}`);
      }
    }
    repairedPlan.styleMotifs = [...motifs];

    const modules = new Set([...(repairedPlan.repairModules || []), ...(hints.addModules || [])]);
    if (modules.size) {
      repairedPlan.repairModules = [...modules];
      actions.push(`request modules ${[...modules].join(', ')}`);
    }

    const enable = new Set([...(repairRules.enable || []), ...(hints.enable || [])]);
    applyEnableHints(repairedRequirement, enable, actions);
    applyElementOverrides(repairedRequirement, hints.elementOverrides || {}, actions);

    if (modules.has('water_feature')) {
      repairedRequirement.elementPreferences.landscape = {
        ...(repairedRequirement.elementPreferences.landscape || {}),
        enabled: true,
        waterFeature: true
      };
    }
    if (modules.has('chimney')) {
      repairedRequirement.elementPreferences.chimney = {
        ...(repairedRequirement.elementPreferences.chimney || {}),
        enabled: true
      };
    }

    return {
      applied: actions.length > 0,
      actions,
      requirement: repairedRequirement,
      plan: repairedPlan
    };
  }
}

function applyEnableHints(requirement, enable, actions) {
  requirement.elementPreferences ||= {};
  if (enable.has('landscape')) {
    requirement.elementPreferences.landscape = {
      ...(requirement.elementPreferences.landscape || {}),
      enabled: true
    };
    actions.push('enable landscape');
  }
  if (enable.has('waterFeature')) {
    requirement.elementPreferences.landscape = {
      ...(requirement.elementPreferences.landscape || {}),
      enabled: true,
      waterFeature: true
    };
    actions.push('enable water feature');
  }
  if (enable.has('chimney')) {
    requirement.elementPreferences.chimney = {
      ...(requirement.elementPreferences.chimney || {}),
      enabled: true
    };
    actions.push('enable chimney');
  }
  if (enable.has('interior')) {
    requirement.elementPreferences.interior = {
      ...(requirement.elementPreferences.interior || {}),
      enabled: true,
      rooms: Math.max(2, requirement.elementPreferences.interior?.rooms || 2)
    };
    actions.push('enable interior');
  }
  if (enable.has('largeWindows')) {
    requirement.elementPreferences.window = {
      ...(requirement.elementPreferences.window || {}),
      width: Math.max(4, requirement.elementPreferences.window?.width || 4),
      height: Math.max(3, requirement.elementPreferences.window?.height || 3)
    };
    actions.push('enlarge windows');
  }
}

function applyElementOverrides(requirement, overrides, actions) {
  requirement.elementPreferences ||= {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!value || typeof value !== 'object') continue;
    requirement.elementPreferences[key] = {
      ...(requirement.elementPreferences[key] || {}),
      ...value
    };
    actions.push(`override ${key}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
