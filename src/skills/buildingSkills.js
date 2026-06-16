export const BUILDING_SKILLS = [
  {
    id: 'european-manor',
    name: '欧式庄园',
    styles: ['欧式'],
    keywords: ['欧式', '欧洲', '古典', '城堡', '庄园', '别墅', '尖顶'],
    preferredFootprint: 'winged',
    styleMotifs: [
      'symmetrical-facade',
      'central-axis',
      'stone-plinth',
      'pilasters',
      'columned-porch',
      'framed-windows',
      'layered-gabled-roof',
      'chimney',
      'side-wing',
      'formal-garden'
    ],
    zoneHints: ['entry', 'living', 'bedroom', 'kitchen', 'study', 'garden'],
    requiredModules: ['wing', 'chimney', 'windows', 'porch', 'columns', 'facade', 'roof_detail', 'garden'],
    optionalModules: ['stairs', 'balcony', 'water_feature'],
    critiqueRules: {
      minimumScore: 88,
      requiredMotifs: ['central-axis', 'columned-porch', 'framed-windows', 'layered-gabled-roof', 'formal-garden'],
      requiredModules: ['wing', 'chimney', 'porch', 'columns', 'facade', 'roof_detail', 'garden']
    },
    repairRules: {
      forceFootprint: 'winged',
      enable: ['chimney', 'landscape'],
      addMotifs: [
        'symmetrical-facade',
        'central-axis',
        'stone-plinth',
        'pilasters',
        'columned-porch',
        'framed-windows',
        'layered-gabled-roof',
        'chimney',
        'side-wing',
        'formal-garden'
      ]
    }
  },
  {
    id: 'jiangnan-courtyard',
    name: '江南水乡小院',
    styles: ['江南', '中式'],
    keywords: ['江南', '水乡', '徽派', '中式', '国风', '庭院', '小院', '白墙', '黑瓦', '黛瓦', '水池', '水景'],
    preferredFootprint: 'courtyard',
    styleMotifs: ['white-wall-dark-roof', 'courtyard-axis', 'eave-corners', 'water-courtyard'],
    zoneHints: ['entry', 'living', 'bedroom', 'kitchen', 'study', 'garden', 'water'],
    requiredModules: ['courtyard', 'garden', 'water_feature', 'roof_detail'],
    optionalModules: ['balcony', 'stairs'],
    critiqueRules: {
      minimumScore: 84,
      requiredMotifs: ['white-wall-dark-roof', 'courtyard-axis'],
      requiredModules: ['courtyard', 'garden']
    },
    repairRules: {
      forceFootprint: 'courtyard',
      enable: ['landscape', 'waterFeature'],
      addMotifs: ['white-wall-dark-roof', 'courtyard-axis', 'water-courtyard']
    }
  },
  {
    id: 'modern-villa',
    name: '现代玻璃别墅',
    styles: ['现代'],
    keywords: ['现代', '简约', '玻璃幕墙', '大玻璃', '落地窗', '平屋顶', '平顶', '别墅'],
    preferredFootprint: 'l-shape',
    styleMotifs: ['flat-roof', 'large-glass', 'offset-volume'],
    zoneHints: ['entry', 'living', 'kitchen', 'bedroom', 'study', 'balcony'],
    requiredModules: ['wing', 'windows'],
    optionalModules: ['balcony', 'lighting'],
    critiqueRules: {
      minimumScore: 82,
      requiredMotifs: ['flat-roof', 'large-glass'],
      requiredModules: ['wing', 'windows']
    },
    repairRules: {
      forceFootprint: 'l-shape',
      enable: ['largeWindows'],
      addMotifs: ['flat-roof', 'large-glass', 'offset-volume']
    }
  },
  {
    id: 'timber-lodge',
    name: '森林木屋',
    styles: ['木屋'],
    keywords: ['木屋', '木质', '森林', '原木', '小屋'],
    preferredFootprint: 'rectangle',
    styleMotifs: ['timber-beams', 'warm-lanterns', 'gabled-roof'],
    zoneHints: ['entry', 'living', 'bedroom', 'kitchen'],
    requiredModules: ['roof', 'lighting'],
    optionalModules: ['chimney', 'garden'],
    critiqueRules: {
      minimumScore: 78,
      requiredMotifs: ['timber-beams', 'gabled-roof'],
      requiredModules: ['roof']
    },
    repairRules: {
      forceFootprint: 'rectangle',
      enable: ['chimney'],
      addMotifs: ['timber-beams', 'warm-lanterns']
    }
  },
  {
    id: 'generic-house',
    name: '通用住宅',
    styles: ['通用'],
    keywords: [],
    preferredFootprint: 'rectangle',
    styleMotifs: ['complete-shell', 'functional-rooms'],
    zoneHints: ['entry', 'living', 'bedroom', 'kitchen'],
    requiredModules: ['walls', 'roof', 'door', 'windows', 'interior'],
    optionalModules: ['garden', 'stairs', 'lighting'],
    critiqueRules: {
      minimumScore: 75,
      requiredMotifs: ['complete-shell'],
      requiredModules: ['walls', 'roof', 'door', 'windows']
    },
    repairRules: {
      forceFootprint: 'rectangle',
      enable: ['interior', 'lighting'],
      addMotifs: ['complete-shell', 'functional-rooms']
    }
  }
];

export function skillSummaries() {
  return BUILDING_SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    styles: skill.styles,
    preferredFootprint: skill.preferredFootprint,
    styleMotifs: skill.styleMotifs,
    requiredModules: skill.requiredModules
  }));
}

export function findSkillById(id) {
  return BUILDING_SKILLS.find((skill) => skill.id === id) || BUILDING_SKILLS.at(-1);
}

export function pickSkill(requirement) {
  const text = [
    requirement.style,
    requirement.scale,
    ...(requirement.features || []),
    ...(requirement.materials || []),
    requirement.prompt
  ].join(' ');

  const scored = BUILDING_SKILLS.map((skill) => ({
    skill,
    score: scoreSkill(skill, requirement, text)
  })).sort((a, b) => b.score - a.score);

  const best = scored[0];
  return best.score > 0 ? best.skill : findSkillById('generic-house');
}

function scoreSkill(skill, requirement, text) {
  let score = 0;
  if (skill.styles.includes(requirement.style)) score += 12;
  for (const keyword of skill.keywords) {
    if (text.includes(keyword)) score += 3;
  }
  if (requirement.scale === 'large' && skill.id === 'european-manor') score += 2;
  if ((requirement.features || []).includes('水景') && skill.id === 'jiangnan-courtyard') score += 4;
  if ((requirement.features || []).includes('大玻璃窗') && skill.id === 'modern-villa') score += 4;
  return score;
}
