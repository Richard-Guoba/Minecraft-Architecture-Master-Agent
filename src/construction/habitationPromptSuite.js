const DOOR_VARIANTS = [
  {
    id: 'south-entry',
    side: 'south',
    text: '门在南侧'
  },
  {
    id: 'east-entry',
    side: 'east',
    text: '门在东侧'
  },
  {
    id: 'north-entry',
    side: 'north',
    text: '门在北侧'
  },
  {
    id: 'west-entry',
    side: 'west',
    text: '门在西侧'
  }
];

const HABITATION_CASES = [
  caseItem('modern-compact-home', ['modern', 'compact', 'single-floor'], '建一个现代紧凑一层住宅，宽17深15，一间卧室，一个卫生间，客厅，厨房，餐厅，玄关和储藏间，大窗采光，屋顶完整防雨'),
  caseItem('modern-family-house', ['modern', 'family', 'two-floor'], '建一个现代两层家庭住宅，宽31深21，三间卧室，两个卫生间，客厅，开放厨房，餐厅，书房，楼梯和储藏间，大玻璃窗但外壳要完整密闭'),
  caseItem('japanese-machiya-home', ['japanese', 'machiya', 'tatami'], '建一个日式一层町屋，宽25深19，一间卧室，一个卫生间，玄关，榻榻米起居，茶室，厨房，餐厅和储藏间，木格栅采光，屋顶完整防雨'),
  caseItem('chinese-courtyard-home', ['chinese-courtyard', 'courtyard'], '建一个中式合院住宅，宽35深27，两间卧室，一个卫生间，门厅，正厅，厨房，餐厅，书房，储藏间和内院，房间都能从门厅连通'),
  caseItem('alpine-snow-lodge', ['alpine', 'lodge', 'snow'], '建一个雪山两层木屋，宽27深23，两间卧室，两个卫生间，壁炉客厅，厨房，餐厅，楼梯，储藏间和泥靴入口，厚墙保暖且屋顶完整'),
  caseItem('coastal-vacation-home', ['coastal', 'deck', 'daylight'], '建一个海滨两层度假住宅，宽31深21，两间卧室，两个卫生间，客厅，厨房，餐厅，阳光房，楼梯和储藏间，大露台但室内要密闭防雨'),
  caseItem('desert-mediterranean-villa', ['desert', 'mediterranean', 'courtyard'], '建一个沙漠地中海一层别墅，宽31深23，两间卧室，一个卫生间，拱廊入口，客厅，厨房，餐厅，书房，储藏间和小庭院，厚墙遮阳'),
  caseItem('industrial-loft-home', ['industrial', 'loft', 'workshop'], '建一个工业风两层 loft 住宅，宽29深21，一间卧室，一个卫生间，开放客厅，厨房，餐厅，工作间，楼梯和储藏间，大窗采光且外壳完整'),
  caseItem('greenhouse-residence', ['greenhouse-house', 'plants', 'glass'], '建一个温室住宅，宽29深23，一间卧室，一个卫生间，客厅，厨房，餐厅，阳光房，植物区和储藏间，大面积玻璃但房子要完整封闭'),
  caseItem('subterranean-lightwell-home', ['subterranean', 'lightwell'], '建一个半地下采光井住宅，宽31深25，两间卧室，一个卫生间，入口门厅，客厅，厨房，餐厅，书房，储藏间和采光井，防水厚墙且连通顺畅'),
  caseItem('treehouse-home', ['treehouse', 'raised', 'vertical-core'], '建一个树屋风格两层住宅，宽23深23，一间卧室，一个卫生间，客厅，厨房，小餐区，楼梯，观景平台和储藏间，树屋平台与室内连通'),
  caseItem('cliffside-cantilever-home', ['cliffside', 'cantilever'], '建一个悬崖边两层现代住宅，宽27深19，两间卧室，一个卫生间，客厅，开放厨房，餐厅，书房，楼梯和储藏间，悬挑平台要有安全栏杆'),
  caseItem('tropical-stilt-house', ['tropical', 'stilt', 'deck'], '建一个热带高脚一层住宅，宽25深19，一间卧室，一个卫生间，客厅，厨房，餐厅，储藏间和宽露台，室内地板架空但外壳要防雨'),
  caseItem('nordic-cabin-home', ['nordic', 'cabin', 'compact'], '建一个北欧两层小木屋，宽19深17，一间卧室，一个卫生间，起居室，餐厨一体，楼梯，储藏间和小书桌，窗户采光且动线紧凑'),
  caseItem('fortified-bunker-home', ['fortified', 'bunker', 'utility'], '建一个半地下防御住宅，宽29深23，两间卧室，一个卫生间，入口缓冲间，客厅，厨房，工作间，设备间和储藏间，厚墙但内部要连通'),
  caseItem('european-family-villa', ['european', 'villa', 'large'], '建一个欧式三层家庭别墅，宽39深29，四间卧室，三个卫生间，门厅，客厅，餐厅，厨房，书房，楼梯，车库和储藏间，立面层次丰富'),
  caseItem('farmhouse-family-home', ['farmhouse', 'garden', 'service'], '建一个乡村一层农舍，宽31深23，两间卧室，一个卫生间，门厅，客厅，厨房，餐厅，储藏间，工作角和菜园入口，屋顶完整防雨'),
  caseItem('urban-townhouse', ['urban', 'townhouse', 'narrow'], '建一个城市三层联排住宅，宽21深17，三间卧室，两个卫生间，一层门厅，客厅，厨房，餐厅，楼梯和储藏间，窄面宽但动线清楚'),
  caseItem('lakeside-cabin', ['lakeside', 'cabin', 'porch'], '建一个湖畔一层木屋，宽23深19，一间卧室，一个卫生间，门廊，起居室，厨房，餐厅，储藏间和观景窗，湿区和睡眠区要分开'),
  caseItem('courtyard-bungalow', ['courtyard', 'bungalow'], '建一个一层庭院平房，宽27深25，两间卧室，一个卫生间，玄关，客厅，厨房，餐厅，储藏间和小内院，所有房间能从公共区到达'),
  caseItem('red-brick-family-house', ['brick', 'family', 'two-floor'], '建一个红砖两层家庭小楼，宽29深21，三间卧室，两个卫生间，门厅，客厅，厨房，餐厅，楼梯，储藏间和后院门，外墙连续完整'),
  caseItem('minimal-white-box-home', ['minimal', 'modern', 'white-box'], '建一个极简白盒两层住宅，宽25深19，两间卧室，两个卫生间，入口，客厅，厨房，餐厅，书房，楼梯和储藏间，少装饰但功能完整'),
  caseItem('mountain-stone-cottage', ['mountain', 'stone', 'cottage'], '建一个山地石屋两层住宅，宽23深21，两间卧室，一个卫生间，门厅，壁炉起居，厨房，餐厅，楼梯和储藏间，厚石墙且窗洞合理'),
  caseItem('ranch-family-house', ['ranch', 'wide', 'single-floor'], '建一个牧场风一层宽住宅，宽33深19，三间卧室，两个卫生间，门厅，客厅，厨房，餐厅，储藏间，洗衣间和长廊，长廊动线清楚'),
  caseItem('home-studio-house', ['studio', 'work-live', 'two-floor'], '建一个居住工作混合两层住宅，宽31深21，两间卧室，一个卫生间，客厅，厨房，餐厅，工作室，楼梯，储藏间和展示柜，生活区与工作区连通')
];

export const HABITATION_EVALUATION_PROMPTS = HABITATION_CASES.flatMap((item, caseIndex) =>
  DOOR_VARIANTS.map((door, doorIndex) => ({
    id: `${item.id}-${door.id}`,
    seed: 2101 + caseIndex * DOOR_VARIANTS.length + doorIndex,
    focus: [...item.focus, door.side, 'habitation', 'entry-connectivity', 'enclosure'],
    prompt: `${item.prompt}，${door.text}。要求作为人类居住的房子必须外壳完整密闭、屋顶覆盖、室内房间彼此连通、有采光和照明。`
  }))
);

function caseItem(id, focus, prompt) {
  return { id, focus, prompt };
}
