const DEFAULT_NEGATIVE_CONTROLS = [
  '不要1:1复制任何单个模板的平面、尺寸或轮廓',
  '至少融合三个参考案例的不同优点',
  '住宅尺度优先，纪念碑模板必须缩放成可居住空间',
  '不要只做空壳，公共房间、卧室、厨房和书房必须有家具组合',
  '不要把场地当平板，入口、前景、地形和水/花园要成为构图'
];

const DEFAULT_EXPECTED_AUDIT_SIGNALS = [
  'template-knowledge-active',
  'composition-strategy-high',
  'template-space-plan-active',
  'template-site-scenes-active',
  'template-interior-scenes-active',
  'law-coverage-90-plus',
  'multi-source-fusion'
];

export const CURATED_TEMPLATE_PROMPT_LIBRARY = [
  promptProfile({
    id: 'modern-waterfront-villa-reference',
    seed: 720101,
    title: 'Modern waterfront villa synthesis',
    typology: 'villa',
    style: 'modern',
    focus: ['curated', 'modern', 'water-edge', 'glass', 'roof-terrace', 'interior-scenes'],
    inspirationCases: ['A Small Modern House', 'Wood Modern House', 'Lakehouse', 'Modern Estate'],
    retrievalTokens: ['modern', 'house', 'villa', 'water-edge', 'large-glass-or-panel-grid', 'roof-terrace', 'garden-composition'],
    userPrompt: '建一个现代滨水别墅，公共空间朝向水景，大玻璃连接水边平台，前景有入口花园和石土台地，屋顶露台可以观景，室内要有客厅、开放厨房、卧室和书房的完整家具场景',
    grammar: {
      siteComposition: '水边平台、反射水面、前景花园、石土台地、由入口路径压缩后展开到景观面',
      massingGrammar: '错动盒子、侧向玻璃翼、主公共核心面向水景，局部露台承接室内外',
      roofGrammar: '薄檐平屋顶、可使用屋顶露台、少量天窗或光槽',
      facadeGrammar: '水平窗带、深玻璃框、少量实体墙与浅色收边形成层次',
      interiorGrammar: '观景客厅社交组、厨房工作墙、书房阅读角、卧室软装和分层灯光'
    }
  }),
  promptProfile({
    id: 'classical-axis-manor-reference',
    seed: 720119,
    title: 'Classical axis manor synthesis',
    typology: 'manor',
    style: 'classical',
    focus: ['curated', 'classical', 'formal-axis', 'garden', 'paired-wings', 'interior-scenes'],
    inspirationCases: ['Colonial Mansion 1', 'Villa', 'White House', 'Mega Mansion'],
    retrievalTokens: ['classical', 'manor', 'formal-axis', 'garden-composition', 'facade-detail', 'furnished-interior'],
    userPrompt: '建一个古典轴线庄园住宅，正立面有中轴、台阶入口和成对侧翼，前景花园像房间一样组织，室内有大厅、客厅、餐厅、书房和卧室的完整身份层',
    grammar: {
      siteComposition: '主路径、对称花园间、入口台阶、低矮围合和到主厅的礼仪序列',
      massingGrammar: '主楼加成对侧翼，入口体块突出，后方可有石质露台',
      roofGrammar: '坡屋顶或克制屋顶线，檐口和屋脊有可读收边',
      facadeGrammar: '安静的对称窗序、柱廊或壁柱节奏、深窗套和入口框景',
      interiorGrammar: '入口大厅揭示楼梯或主厅，公共房间有焦点墙、展示柜、地毯锚点和层次灯光'
    }
  }),
  promptProfile({
    id: 'japanese-courtyard-retreat-reference',
    seed: 720137,
    title: 'Japanese courtyard retreat synthesis',
    typology: 'courtyard-house',
    style: 'japanese',
    focus: ['curated', 'japanese', 'courtyard', 'layered-eaves', 'garden', 'threshold'],
    inspirationCases: ['Japanese temple - (mcbuild_org)', 'Japanese pagoda Plus Tea House', 'Ygdrassil\'s Retreat'],
    retrievalTokens: ['japanese', 'courtyard', 'layered-eaves', 'dry-garden', 'threshold', 'water-edge', 'interior-reference'],
    userPrompt: '建一个日式庭院住宅，低矮体块围合安静院子，入口有过渡门庭、枯山水和缘侧感平台，屋顶用层叠深檐，室内包含茶室、榻榻米房、客厅和书房场景',
    grammar: {
      siteComposition: '前庭压缩、内院展开、石庭、水缘、植物口袋和静态路径',
      massingGrammar: '低矮围合体块、庭院或天井为核心，公共房间面向院子',
      roofGrammar: '低坡深檐、层叠檐口、屋顶边缘比主体更宽',
      facadeGrammar: '木柱、屏风格窗、开口成格、实体墙与庭院开口形成明暗节奏',
      interiorGrammar: '低家具、榻榻米感地面、茶室焦点、书房展示墙和柔和灯光'
    }
  }),
  promptProfile({
    id: 'medieval-spruce-home-reference',
    seed: 720155,
    title: 'Medieval spruce home synthesis',
    typology: 'house',
    style: 'medieval',
    focus: ['curated', 'medieval', 'spruce', 'cozy-interior', 'garden', 'micro-detail'],
    inspirationCases: ['Medieval Home', 'Medieval Spruce Wood House', 'Tavern', 'Big spruce house'],
    retrievalTokens: ['medieval', 'spruce', 'house', 'tavern', 'micro-block-detailing', 'rail-and-fence-detail', 'furnished-interior'],
    userPrompt: '建一个中世纪云杉木住宅，木石基座嵌入轻微起伏地形，入口前有小花园和路径，屋顶厚重有深檐，立面有梁柱、栏杆和窗台细节，室内温暖且家具丰富',
    grammar: {
      siteComposition: '碎石路径、小花园、树丛和石土基座包住建筑脚部',
      massingGrammar: '紧凑主屋、可带侧向厨房或小二层，入口门廊明确',
      roofGrammar: '陡坡厚屋顶、深檐、屋脊和山墙收边',
      facadeGrammar: '木梁框架、石基座、窗台花箱、栏杆和小尺度深度',
      interiorGrammar: '壁炉感客厅、厨房工作墙、卧室睡眠龛、储物墙和暖光'
    }
  }),
  promptProfile({
    id: 'gothic-hill-manor-reference',
    seed: 720173,
    title: 'Gothic hill manor synthesis',
    typology: 'manor',
    style: 'gothic',
    focus: ['curated', 'gothic', 'hill', 'tower', 'stone-massing', 'interior-scenes'],
    inspirationCases: ['Gotic castle', 'Dark Mansion', 'Haunted House', 'Small_Medium Castle'],
    retrievalTokens: ['gothic', 'castle', 'tower', 'vertical-icon', 'stone-massing', 'terrain-integrated', 'facade-detail'],
    userPrompt: '建一个哥特山坡宅邸，石质台地承托主体，角部有塔楼书房，尖拱窗和扶壁形成竖向节奏，前景庭院有路径和植物，室内有仪式大厅、书房和卧室场景',
    grammar: {
      siteComposition: '山坡石台、台阶路径、前景庭院和深色植物边界',
      massingGrammar: '主厅体块加角塔或竖向标志，入口被塔和高窗强调',
      roofGrammar: '陡屋顶、塔帽或暗色屋顶边缘，屋顶轮廓有尖锐记忆点',
      facadeGrammar: '尖拱窗、竖向窗槽、扶壁、深色石材和浅色描边',
      interiorGrammar: '大厅焦点墙、长向动线、书房展示墙、蜡烛/灯笼层次'
    }
  }),
  promptProfile({
    id: 'sandstone-oasis-mansion-reference',
    seed: 720191,
    title: 'Sandstone oasis mansion synthesis',
    typology: 'courtyard-house',
    style: 'desert',
    focus: ['curated', 'desert', 'courtyard', 'water-garden', 'shade', 'roof-terrace'],
    inspirationCases: ['Sandstone Mansion', 'Great Pyramid', 'Desert Courtyard Oasis'],
    retrievalTokens: ['desert', 'sandstone', 'courtyard', 'water-garden', 'roof-terrace', 'thick-wall', 'interior-scenes'],
    userPrompt: '建一个沙岩绿洲宅邸，厚墙围合中心庭院和水景，入口有遮阴廊和前景小花园，屋顶露台可使用，室内有储物墙、厨房、客厅和卧室场景',
    grammar: {
      siteComposition: '沙地台地、中心水景、遮阴路径、低植物和入口过渡',
      massingGrammar: '厚墙庭院、外实内开，公共房间围绕水景展开',
      roofGrammar: '平屋顶、女儿墙、屋顶露台和少量采光口',
      facadeGrammar: '小而深的开口、拱形或厚窗洞、浅色砂岩层次',
      interiorGrammar: '清凉公共厅、储物墙、厨房工作面、卧室壁龛和暖色灯光'
    }
  }),
  promptProfile({
    id: 'cave-hillside-luxury-reference',
    seed: 720209,
    title: 'Cave hillside luxury synthesis',
    typology: 'earth-shelter',
    style: 'subterranean',
    focus: ['curated', 'cave', 'hillside', 'terrain', 'lightwell', 'interior-scenes'],
    inspirationCases: ['Cave House', 'Luxurious Cove House', 'Subterranean Hillside Villa'],
    retrievalTokens: ['cave', 'subterranean', 'hillside', 'terrain-integrated', 'lightwell', 'water-edge', 'layered-interior'],
    userPrompt: '建一个半地下山坡豪宅，泥土和石头形成外部地形，建筑通过下沉庭院、采光井和水边小平台获得光线，室内要有观景客厅、厨房、卧室、书房和储藏场景',
    grammar: {
      siteComposition: '覆土地形、石质挡墙、下沉庭院、水边平台和曲折入口',
      massingGrammar: '主体嵌入山坡，公共空间朝采光庭或景观面打开',
      roofGrammar: '覆土或草地屋顶，局部平顶平台和采光井',
      facadeGrammar: '石土边界、少量大开口、深窗洞和露台门',
      interiorGrammar: '采光井旁公共核心、储物墙、阅读角、卧室软光和路径灯'
    }
  }),
  promptProfile({
    id: 'glass-estate-slope-reference',
    seed: 720227,
    title: 'Glass estate slope synthesis',
    typology: 'estate',
    style: 'modern',
    focus: ['curated', 'modern', 'estate', 'slope', 'glass', 'massing'],
    inspirationCases: ['Modern Estate', 'Big minecraft modern house', 'Modern Mansion', 'Iron Man\'s Mansion'],
    retrievalTokens: ['modern', 'estate', 'mansion', 'slope', 'large-glass-or-panel-grid', 'roof-terrace', 'facade-depth'],
    userPrompt: '建一个现代坡地大宅，错动体块顺着地形展开，有大玻璃景观面、入口前景花园、石土台地、屋顶露台和丰富室内生活场景',
    grammar: {
      siteComposition: '坡地台阶、前景花园、石土挡墙和到主厅的路径',
      massingGrammar: '多盒子错动、玻璃翼和实体服务翼对比，露台插入体块之间',
      roofGrammar: '平屋顶、薄女儿墙、屋顶活动平台',
      facadeGrammar: '大玻璃与实墙穿插、水平线条、深框和阳台栏杆',
      interiorGrammar: '开放公共核心、观景坐席、厨房岛台、套房和工作区'
    }
  }),
  promptProfile({
    id: 'watermill-riverside-home-reference',
    seed: 720245,
    title: 'Watermill riverside home synthesis',
    typology: 'house',
    style: 'rustic',
    focus: ['curated', 'rustic', 'river', 'water-edge', 'micro-detail', 'garden'],
    inspirationCases: ['Watermill', 'Lakehouse', 'Riverside craftsman house', 'Market with the villagers'],
    retrievalTokens: ['watermill', 'river', 'water-edge', 'rustic', 'rail-and-fence-detail', 'garden-composition', 'furnished-interior'],
    userPrompt: '建一个河边水磨坊风住宅，水边平台和小水渠成为场地一部分，木石体块有栏杆、梁柱和窗台细节，入口有花园路径，室内有客厅、厨房、工作间和卧室',
    grammar: {
      siteComposition: '河岸、水渠、木平台、前景路径和自然植被',
      massingGrammar: '紧凑主屋带水边工作翼或小平台，公共空间看向水面',
      roofGrammar: '坡屋顶、深檐、屋脊和水边平台遮盖',
      facadeGrammar: '木梁、石基座、栏杆、窗台和水边机械感细节',
      interiorGrammar: '工作间、厨房、客厅社交组、储物墙和暖色灯光'
    }
  }),
  promptProfile({
    id: 'urban-loft-apartment-reference',
    seed: 720263,
    title: 'Urban loft apartment synthesis',
    typology: 'loft-house',
    style: 'industrial',
    focus: ['curated', 'industrial', 'urban', 'loft', 'roof-garden', 'interior-scenes'],
    inspirationCases: ['Modern Apartment Building', 'Grand Hotel', 'Futuristic Building'],
    retrievalTokens: ['industrial', 'loft', 'urban', 'large-glass-or-panel-grid', 'roof-garden', 'layered-interior'],
    userPrompt: '建一个城市工业风 loft 住宅，狭长地块也要有入口小庭院和屋顶花园，高窗和大玻璃引入光线，室内有挑高客厅、开放厨房、工作区和卧室夹层感',
    grammar: {
      siteComposition: '紧凑前庭、硬质铺地、少量植物、屋顶花园和城市边界',
      massingGrammar: '长条或竖向紧凑体块，公共核心挑高，服务空间贴边',
      roofGrammar: '平屋顶、设备/花园区、天窗或光槽',
      facadeGrammar: '工业窗格、砖或混凝土墙、钢感收边、服务构件成组',
      interiorGrammar: '挑高社交区、厨房工作墙、工作台、展示架和卧室软隔'
    }
  }),
  promptProfile({
    id: 'fantasy-sky-retreat-reference',
    seed: 720281,
    title: 'Fantasy sky retreat synthesis',
    typology: 'retreat',
    style: 'fantasy',
    focus: ['curated', 'fantasy', 'vertical-icon', 'garden', 'terrain', 'interior-scenes'],
    inspirationCases: ['The Sky City of Athalux', 'Ygdrassil\'s Retreat', 'Tower of Gods'],
    retrievalTokens: ['fantasy', 'temple', 'vertical-icon', 'terrain-integrated', 'garden-composition', 'landmark-presence'],
    userPrompt: '建一个幻想风高地隐居宅，不能做成巨型城堡，要把模板里的垂直标志、台地、花园和仪式入口缩放成可居住住宅，室内有大厅、书房、卧室和观景平台',
    grammar: {
      siteComposition: '高地台座、曲折入口、植物口袋、观景平台和小型仪式前庭',
      massingGrammar: '住宅尺度主楼加一个垂直标志，不复制大型神殿平面',
      roofGrammar: '层级屋顶或塔帽，轮廓有幻想感但高度受控',
      facadeGrammar: '竖向开口、发光点、石材与木材混合、入口框景',
      interiorGrammar: '仪式感大厅、观景书房、卧室软装、展示墙和路径灯'
    }
  }),
  promptProfile({
    id: 'compact-small-modern-reference',
    seed: 720299,
    title: 'Compact small modern synthesis',
    typology: 'house',
    style: 'modern',
    focus: ['curated', 'compact', 'modern', 'garden', 'glass', 'interior-density'],
    inspirationCases: ['A Small Modern House', 'Classic Modern House', 'Modern House 10'],
    retrievalTokens: ['small', 'modern', 'house', 'glass-emphasis', 'garden-composition', 'furnished-interior', 'micro-block-detailing'],
    userPrompt: '建一个紧凑现代小住宅，体量不大但要有前景花园、大玻璃、入口过渡、屋顶可用平台和高密度室内场景，客厅、厨房、卧室、书房都要能被识别',
    grammar: {
      siteComposition: '小尺度前庭、入口路径、种植床和一个小平台',
      massingGrammar: '紧凑盒子加小侧翼或露台，不靠巨大尺度取胜',
      roofGrammar: '薄平屋顶、可用屋顶角落、简单光槽',
      facadeGrammar: '少量大玻璃、清晰深框、入口细节和干净实墙',
      interiorGrammar: '小房间也要有完整身份层，家具组合贴边布置，中心保持通行'
    }
  })
];

export const CURATED_TEMPLATE_PROMPTS = CURATED_TEMPLATE_PROMPT_LIBRARY.map(toPromptSuiteCase);

export function listCuratedTemplatePrompts() {
  return CURATED_TEMPLATE_PROMPT_LIBRARY.map((profile) => ({
    id: profile.id,
    title: profile.title,
    style: profile.style,
    typology: profile.typology,
    seed: profile.seed,
    focus: profile.focus,
    inspiration_cases: profile.inspiration_cases
  }));
}

export function findCuratedTemplatePrompt(id) {
  return CURATED_TEMPLATE_PROMPT_LIBRARY.find((profile) => profile.id === id);
}

export function resolveCuratedTemplatePrompt(id, extraPrompt = '') {
  const profile = findCuratedTemplatePrompt(id);
  if (!profile) {
    const ids = CURATED_TEMPLATE_PROMPT_LIBRARY.map((item) => item.id).join(', ');
    throw new Error(`未知推荐提示词: ${id}。可用提示词: ${ids}`);
  }
  return {
    profile,
    prompt: renderExecutablePrompt(profile, extraPrompt)
  };
}

export function toPromptSuiteCase(profile) {
  return {
    id: profile.id,
    seed: profile.seed,
    focus: profile.focus,
    prompt: renderExecutablePrompt(profile)
  };
}

export function renderExecutablePrompt(profile, extraPrompt = '') {
  const grammar = profile.grammar || {};
  const parts = [
    profile.user_prompt,
    `强参考复现目标：接近模板库顶级房子的体量比例、轮廓层次、场地构图、材质气质和细节密度，但不逐块复制。`,
    `参考案例：${profile.inspiration_cases.join('、')}。`,
    `检索标签：${profile.retrieval_tokens.join('、')}。`,
    `场地语法：${grammar.site_composition}`,
    `体块语法：${grammar.massing_grammar}`,
    `屋顶语法：${grammar.roof_grammar}`,
    `立面语法：${grammar.facade_grammar}`,
    `室内语法：${grammar.interior_grammar}`,
    `负向控制：${profile.negative_controls.join('；')}。`,
    `验收信号：${profile.expected_audit_signals.join('、')}。`,
    extraPrompt ? `用户补充：${extraPrompt}` : ''
  ].filter(Boolean);
  return parts.join(' ');
}

function promptProfile({
  id,
  seed,
  title,
  typology,
  style,
  focus,
  inspirationCases,
  retrievalTokens,
  userPrompt,
  grammar,
  negativeControls = DEFAULT_NEGATIVE_CONTROLS,
  expectedAuditSignals = DEFAULT_EXPECTED_AUDIT_SIGNALS
}) {
  return {
    id,
    seed,
    title,
    typology,
    style,
    focus,
    inspiration_cases: inspirationCases,
    retrieval_tokens: retrievalTokens,
    user_prompt: userPrompt,
    grammar: normalizeGrammar(grammar),
    negative_controls: negativeControls,
    expected_audit_signals: expectedAuditSignals
  };
}

function normalizeGrammar(grammar = {}) {
  return {
    site_composition: grammar.siteComposition,
    massing_grammar: grammar.massingGrammar,
    roof_grammar: grammar.roofGrammar,
    facade_grammar: grammar.facadeGrammar,
    interior_grammar: grammar.interiorGrammar
  };
}
