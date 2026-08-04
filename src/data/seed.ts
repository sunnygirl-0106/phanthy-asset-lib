/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 种子数据】seed.ts —— 完整演员表版（接真实图片）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 这个文件负责什么：把 demo所需素材 里那 41 张图、7 个账号、5 个项目，
 * 组织成一份能驱动界面、也能验证规则的假数据（World）。
 *
 * 图片路径约定：图片放在工程的 public/assets/ 下，通过 assetUrl() 生成 URL。
 *   例如 team-library/suwan_role.png → cover: assetUrl('assets/team-library/suwan_role.png')
 * （这样本地根路径与 GitHub Pages 的项目子路径都能正确访问。）
 *
 * createSeedWorld() 每次返回一份全新的 World，测试之间互不污染。
 * ─────────────────────────────────────────────────────────────────────── */

import type { World, User, Team, Project, Canvas, Asset, Candidate, Category, Scope } from './types'
import { PRESET_VOICES } from './presetVoices'
import { assetUrl } from '../utils/assets'

/** 图片根目录：所有 cover 都以它开头。 */
const IMG = assetUrl('assets')

/* ─── 演示用提示词模板（v6 · 改动七）─────────────────────────────────────
 * 演示阶段只按类目对号入座：所有角色/造型共用同一段【人物】模板，所有服装共用【服装】模板，
 * 以此类推。原样照抄、保留方括号占位、不按资产个性化改写。素模与造型不区分（同一段人物模板）。 */
export const PROMPT_CHARACTER = `【性别】+【年龄段】的角色，【脸型】，【五官特征描述，如眉眼、鼻唇】，【肤色与肤质】。【发型 + 发色 + 发饰状态】，【表情与眼神情绪】。【身材比例与体态】，【姿势动作，如站/坐/回眸/伸手】，整体呈现【气质定位，如清冷/温婉/英气/慵懒】。补充【视角与构图，如正面/三分侧脸/半身/全身】，【光影类型，如柔光/侧逆光/电影感布光】。画质要求：高清写实/插画/二次元等风格，皮肤与发丝细节清晰，睫毛纹理分明，背景虚化突出主体。`
export const PROMPT_COSTUME = `一套【服装类型 + 整体风格，如古风襦裙/现代西装/未来机能】，【主体颜色 + 辅助配色】。【上装描述：领型、袖型、版型】，【下装或整体轮廓】。【面料材质，如真丝/棉麻/皮革/金属】，呈现对应的【质感与垂坠或硬挺感】。【装饰细节：刺绣/印花/滚边/金属扣/流苏等及其位置】。【配饰：腰带、披风、外搭及其状态】。整体配色基调为【冷/暖/高级灰等】，风格【清雅/华丽/简约/繁复】。画质要求：面料纹理清晰，刺绣与细节可见，自然光下真实的材质质感与光影层次。`
export const PROMPT_SCENE = `【时间 + 季节 + 天气】的【地点类型，如庭院/街道/森林/室内/异世界】。【主体建筑或环境结构描述】，【近景元素，如水池、桌椅、植物、器物】。【中远景元素，如远山、楼宇、天空】。【氛围光线，如晨光/暮色/月光/灯火】，营造出【整体氛围，如静谧/热闹/苍凉/梦幻】。补充【色调倾向，如青绿/暖黄/冷蓝】，【景深与空间层次】。画质要求：环境细节丰富，光影自然通透，空间纵深感强，电影级场景氛围，与人物主体和谐融合，背景服务于整体意境。`
export const PROMPT_PROP = `一件【道具类型，如武器/器皿/乐器/书卷/法器/日常物件】，【整体造型与轮廓】。【主体材质，如金属/木质/玉石/陶瓷/织物】，【颜色与光泽感】。【表面纹样或雕刻细节，如花纹、符文、铭文及其分布】。【尺寸比例与结构部件】，【使用或摆放状态，如手持/悬浮/置于台上】。【附加元素，如光效、流苏、镶嵌宝石、磨损痕迹】，体现【道具的年代感或功能属性】。画质要求：材质质感真实，细节纹理清晰，光影反射自然，主体突出，可作为特写或点缀元素融入画面。`

/** 类目 → 演示提示词模板（audio：seed 里当前没有音频资产，占位空串）。 */
const PROMPT_BY_CATEGORY: Record<Category, string> = {
  character: PROMPT_CHARACTER,
  costume: PROMPT_COSTUME,
  scene: PROMPT_SCENE,
  prop: PROMPT_PROP,
  audio: '',
  other: '', // 「其他」是存进来的成品留存物，不由提示词生成，给空串。
}

/* ─── 账号 / 团队 / 项目 id 常量（集中定义，避免裸字符串写错）─── */
export const IDS = {
  admin: 'u_admin',
  sunny: 'u_sunny', // 团队A 主账号（默认视角，内容最全）
  lin: 'u_lin',     // 团队A 子账号，被分配到"霓虹东京"
  may: 'u_may',     // 团队A 子账号，被分配到"都市迷案"
  ze: 'u_ze',       // 团队B 主账号
  lu: 'u_lu',       // 团队B 子账号，被分配到"星际公约"
  zhou: 'u_zhou',   // Solo 一人团队主账号

  teamA: 'team_a',
  teamB: 'team_b',
  teamSolo: 'team_solo',

  projNeon: 'proj_neon',   // 霓虹东京（团队A · 分配给小林）
  projShanhai: 'proj_shanhai', // 山海志（团队A · 演复用）
  projUrban: 'proj_urban', // 都市迷案（团队A · 分配给阿May · 演空项目从库添加）
  projStar: 'proj_star',   // 星际公约（团队B · 分配给小鹿）
  projBoat: 'proj_boat',   // 孤舟（Solo）
} as const

/* ─── 造资产的小助手：省去每份都写全字段 ─── */
function asset(
  partial: Partial<Asset> & Pick<Asset, 'id' | 'category' | 'name' | 'scope' | 'cover'>,
): Asset {
  return {
    scopeId: undefined,
    status: 'done',
    fields: {},
    tags: [],
    // 演示提示词（v6）：按类目对号入座。partial 里没有 prompt，所以下面的 ...partial 不会覆盖它。
    prompt: PROMPT_BY_CATEGORY[partial.category],
    createdAt: 0,
    ...partial,
  }
}

/* ─── 候选池小助手（0803）：把一串图片 url 变成候选图数组。
 * 定稿图（asset.cover）必定也在池中——种子里把定稿那张放在数组首位即可。 */
let _candSeq = 1
function cands(urls: string[]): Candidate[] {
  return urls.map((url) => ({ id: `cand_seed_${_candSeq++}`, url, createdAt: 0 }))
}

/* ─── 音频资产小助手（占位）─────────────────────────────────────────────
 * 音频没有封面图 → cover 留空；可播放音源与时长塞进 fields（audioUrl / duration）。
 * 本期没有真实 BGM 素材，音源先复用两段预置音色 mp3 占位（能真的点开试听）。 */
const AUDIO_SRC = [
  `${IMG}/voices/preset_voice_female.mp3`,
  `${IMG}/voices/preset_voice_male.mp3`,
]
// 音频没有真实封面：统一给一张波形占位图，保证资产库网格（AssetCard）不出现裂图。
const AUDIO_COVER = `${IMG}/canvas/audio-placeholder.svg`
function audioAsset(
  id: string, name: string, scope: Scope, scopeId: string | undefined, duration: string, srcIdx: number,
): Asset {
  return asset({
    id, category: 'audio', name, scope, scopeId, cover: AUDIO_COVER,
    fields: { duration, audioUrl: AUDIO_SRC[srcIdx % AUDIO_SRC.length] },
  })
}

/* ─── 「其他」类目小助手（仅项目库）─────────────────────────────────────────
 * 创作过程的留存物（分镜图 / 视频片段 / 剧本文本 / 音频片段），媒介写进 fields.media：
 *   · image：coverOrSrc 是图片地址；
 *   · video：coverOrSrc 是首帧/海报图（videoUrl 本期留空占位）；
 *   · text ：coverOrSrc 是正文（无封面，卡片渲染文字预览）。
 * 音频不进「其他」：音频有自己的类目，只在那里存。 */
function otherAsset(
  id: string, name: string, scopeId: string,
  media: 'image' | 'video' | 'text', coverOrSrc: string, duration?: string,
): Asset {
  const noCover = media === 'text'
  const dur = duration ? { duration } : {}
  return asset({
    id, category: 'other', name, scope: 'project', scopeId,
    cover: noCover ? '' : coverOrSrc,
    fields:
      media === 'text'
        ? { media, text: coverOrSrc }
        : media === 'video'
          ? { media, videoUrl: '', ...dur }
          : { media },
  })
}

/** 演示用剧本正文（约 200 字），给「第一幕剧本·雨夜追踪」这份文本类「其他」资产。 */
const SCRIPT_RAINY_CHASE = `【第一幕 · 雨夜追踪】

雨点砸在霓虹招牌上，碎成一片猩红。阿杰压低帽檐，贴着湿冷的墙根疾行，身后的脚步声始终不远不近。

他猛地拐进一条死巷，back 抵住铁皮门，屏住呼吸。水顺着发梢往下淌，视网膜投影里，目标的信号正一点点逼近。

"你躲不掉的。" 追踪者的声音混在雨声里，冷得像刀。

阿杰的手指扣上腰间的全息手环——只剩最后一次机会。他数到三，翻身撞开生锈的卷帘门，冲进了更深的黑暗。`

export function createSeedWorld(): World {
  /* ── 用户（头像用真实图）── */
  const users: User[] = [
    { id: IDS.admin, name: 'Admin', avatar: `${IMG}/avatars/admin_avatar.png`, role: 'admin' },
    { id: IDS.sunny, name: 'Sunny', avatar: `${IMG}/avatars/sunny_avatar.png`, role: 'owner', teamId: IDS.teamA },
    { id: IDS.lin, name: '小林', avatar: `${IMG}/avatars/xiaolin_avatar.png`, role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
    { id: IDS.may, name: '阿May', avatar: `${IMG}/avatars/amay_avatar.png`, role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
    { id: IDS.ze, name: '阿泽', avatar: `${IMG}/avatars/aze_avatar.png`, role: 'owner', teamId: IDS.teamB },
    { id: IDS.lu, name: '小鹿', avatar: `${IMG}/avatars/xiaolu_avatar.png`, role: 'sub', teamId: IDS.teamB, parentId: IDS.ze },
    { id: IDS.zhou, name: '老周', avatar: `${IMG}/avatars/laozhou_avatar.png`, role: 'owner', teamId: IDS.teamSolo },
  ]

  /* ── 团队（两扇门都用默认：门A对子账号开、门B关）── */
  const teams: Team[] = [
    { id: IDS.teamA, ownerId: IDS.sunny },
    { id: IDS.teamB, ownerId: IDS.ze },
    { id: IDS.teamSolo, ownerId: IDS.zhou },
  ]

  /* ── 项目（封面用真实图）── */
  const projects: Project[] = [
    { id: IDS.projNeon, name: '霓虹东京', tag: '赛博', teamId: IDS.teamA, cover: `${IMG}/project-covers/neon_tokyo_cover.png`, createdAt: 1_721_620_000_000, assignedSubs: [IDS.lin] },
    { id: IDS.projShanhai, name: '山海志', tag: '国风', teamId: IDS.teamA, cover: `${IMG}/project-covers/shanhai_cover.png`, createdAt: 1_721_360_000_000, assignedSubs: [IDS.lin] },
    { id: IDS.projUrban, name: '都市迷案', tag: '写实', teamId: IDS.teamA, cover: `${IMG}/project-covers/urban_mystery_cover.png`, createdAt: 1_721_190_000_000, assignedSubs: [IDS.may] },
    { id: IDS.projStar, name: '星际公约', tag: '科幻', teamId: IDS.teamB, cover: `${IMG}/project-covers/starcovenant_cover.png`, createdAt: 1_720_980_000_000, assignedSubs: [IDS.lu] },
    { id: IDS.projBoat, name: '孤舟', tag: '写实', teamId: IDS.teamSolo, cover: `${IMG}/project-covers/loneboat_cover.png`, createdAt: 1_720_760_000_000, assignedSubs: [] },
  ]

  /* ── 画布：每个项目下的"无限画布"草稿台。列表缩略图先复用项目封面 ── */
  const canvas = (id: string, projectId: string, name: string, cover: string, createdAt: number): Canvas => ({
    id, projectId, name, cover, createdAt,
  })
  const canvases: Canvas[] = [
    canvas('cv_neon_1', IDS.projNeon, '开场·雨夜街头', `${IMG}/proj-neon-tokyo/neon_bar_scene.png`, 1_721_620_000_000),
    canvas('cv_neon_2', IDS.projNeon, '追逐分镜', `${IMG}/project-covers/neon_tokyo_cover.png`, 1_721_450_000_000),
    canvas('cv_shanhai_1', IDS.projShanhai, '竹林初见', `${IMG}/proj-shanhai/bamboo_forest_scene.png`, 1_721_300_000_000),
    canvas('cv_urban_1', IDS.projUrban, '案发现场', `${IMG}/project-covers/urban_mystery_cover.png`, 1_721_200_000_000),
    canvas('cv_star_1', IDS.projStar, '星舰甲板', `${IMG}/project-covers/starcovenant_cover.png`, 1_721_100_000_000),
    canvas('cv_boat_1', IDS.projBoat, '独木出海', `${IMG}/project-covers/loneboat_cover.png`, 1_721_000_000_000),
  ]

  /* ── 资产 ─────────────────────────────────────────────────────── */
  const assets: Asset[] = [
    /* 【广场·官方货架 9】四类目齐（角色/服装/场景/道具）*/
    asset({
      id: 'a_cyber_police', category: 'character', name: '赛博女警', scope: 'plaza',
      // 广场是官方成品货架：只展示定稿（规则 14）。
      cover: `${IMG}/plaza-shelf/cyber_police_role.png`,
      fields: { gender: '女', age: '青年', style: '赛博' },
      voice: { ...PRESET_VOICES[0] }, // 广场角色有音色、可试听、但不可改
    }),
    asset({ id: 'a_cyber_uniform', category: 'costume', name: '女警制服', scope: 'plaza', cover: `${IMG}/plaza-shelf/cyber_police_uniform.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_rainy_rooftop', category: 'scene', name: '雨夜天台', scope: 'plaza', cover: `${IMG}/plaza-shelf/rainy_rooftop_scene.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_holo_bracelet', category: 'prop', name: '全息手环', scope: 'plaza', cover: `${IMG}/plaza-shelf/holographic_bracelet_prop.png`, fields: { style: '赛博' } }),
    asset({
      id: 'a_swordsman', category: 'character', name: '东方剑客', scope: 'plaza',
      cover: `${IMG}/plaza-shelf/eastern_swordsman_role.png`,
      fields: { gender: '男', age: '青年', style: '国风' },
    }),
    asset({
      id: 'a_mech_butler', category: 'character', name: '机械管家', scope: 'plaza',
      cover: `${IMG}/plaza-shelf/mech_butler_role.png`,
      fields: { style: '科幻' },
    }),
    asset({ id: 'a_swordsman_robe', category: 'costume', name: '剑客长袍', scope: 'plaza', cover: `${IMG}/plaza-shelf/swordsman_robe_costume.png`, fields: { style: '国风' } }),
    asset({ id: 'a_cyber_street', category: 'scene', name: '赛博街市', scope: 'plaza', cover: `${IMG}/plaza-shelf/cyber_street_scene.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_lightsaber', category: 'prop', name: '光剑', scope: 'plaza', cover: `${IMG}/plaza-shelf/lightsaber_prop.png`, fields: { style: '科幻' } }),

    /* 【团队A 团队库·母版】（0804 修订 · 规则 14）
       团队库只展示定稿：它不能生成（规则 15），资产又都是从项目存入上来的副本、
       跨层流转只带定稿——所以结构上就不该有候选池。生产过程一律留在项目层。 */
    // 成品：苏晚（定稿 = 原素模图）
    asset({
      id: 'a_suwan', category: 'character', name: '苏晚', scope: 'team', scopeId: IDS.teamA,
      cover: `${IMG}/character-base/suwan_base.png`, // ← 定稿 = 原素模
      fields: { gender: '女', age: '青年', style: '国风' },
      voice: { ...PRESET_VOICES[0] }, // 已设置 + 可编辑
      createdAt: 1_785_000_000_000,
    }),
    // 已生成的变体资产（独立）：苏晚·国风造型（以苏晚定稿图为参考生成，已有定稿图）
    asset({
      id: 'a_suwan_guofeng', category: 'character', name: '苏晚·国风造型', scope: 'team', scopeId: IDS.teamA,
      cover: `${IMG}/team-library/suwan_look_guofeng.png`,
      referenceImages: [`${IMG}/character-base/suwan_base.png`],
      referencedFrom: 'a_suwan',
      fields: { gender: '女', age: '青年', style: '国风' },
      createdAt: 1_784_900_000_000,
    }),
    // 成品：老K（定稿 = 原素模图）
    asset({
      id: 'a_oldk', category: 'character', name: '老K', scope: 'team', scopeId: IDS.teamA,
      cover: `${IMG}/character-base/oldk_base.png`,
      fields: { gender: '男', age: '中年' },
      voice: { ...PRESET_VOICES[1] }, // 已设置 + 可编辑
      createdAt: 1_784_600_000_000,
    }),
    asset({ id: 'a_cyber_jacket', category: 'costume', name: '赛博夹克', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/cyber_jacket_costume.png`, fields: { style: '赛博' }, createdAt: 1_784_300_000_000 }),
    asset({ id: 'a_palace_dress', category: 'costume', name: '国风宫装', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/palace_dress_costume.png`, fields: { style: '国风' }, createdAt: 1_784_000_000_000 }),
    asset({ id: 'a_ancient_dock', category: 'scene', name: '古镇码头', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/ancient_dock_scene.png`, fields: { style: '国风' }, createdAt: 1_783_700_000_000 }),
    asset({ id: 'a_folding_fan', category: 'prop', name: '折扇', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team-library/folding_fan_prop.png`, fields: { style: '国风' }, createdAt: 1_783_400_000_000 }),

    /* 【项目·霓虹东京】初始态清零（0805 · 改动二）：角色 / 服装 / 场景 / 道具四类
       起始为空，由「演示 → 资产生成」现场灌入（见文件末尾 DEMO_NEON_ASSETS）。
       留在种子里的只有音频（下方）与「其他」留存物（紧接其后）。 */
    // 【项目·霓虹东京 · 其他】创作留存物：图片 / 视频 / 文本三种媒介（音频不进「其他」，只存音频类目），仅存本项目、不存入。
    otherAsset('a_other_mission', '任务线·九宫格分镜', IDS.projNeon, 'image', `${IMG}/proj-neon-tokyo/mission_storyboard_other.png`),
    otherAsset('a_other_plot', '完整情节故事板', IDS.projNeon, 'image', `${IMG}/proj-neon-tokyo/full_plot_board_other.png`),
    otherAsset('a_other_rainy', '雨夜街头·分镜片段', IDS.projNeon, 'video', `${IMG}/proj-neon-tokyo/rainy_street_storyboard_other.png`, '0:12'),
    otherAsset('a_other_script', '第一幕剧本·雨夜追踪', IDS.projNeon, 'text', SCRIPT_RAINY_CHASE),

    /* 【项目·山海志 3】（团队A）*/
    asset({
      id: 'a_shangui', category: 'character', name: '山鬼', scope: 'project', scopeId: IDS.projShanhai,
      cover: `${IMG}/character-base/shangui_base.png?g=1`,
      candidates: cands([`${IMG}/character-base/shangui_base.png?g=1`]), // 只展示定稿：池中恒 1（0805 · 改动三）
      fields: { style: '国风' },
    }),
    asset({
      id: 'a_bamboo', category: 'scene', name: '竹林', scope: 'project', scopeId: IDS.projShanhai,
      cover: `${IMG}/proj-shanhai/bamboo_forest_scene.png?g=1`, fields: { style: '国风' },
      candidates: cands([`${IMG}/proj-shanhai/bamboo_forest_scene.png?g=1`]),
    }),
    asset({
      id: 'a_token', category: 'prop', name: '令牌', scope: 'project', scopeId: IDS.projShanhai,
      cover: `${IMG}/proj-shanhai/token_prop.png?g=1`, fields: { style: '国风' },
      candidates: cands([`${IMG}/proj-shanhai/token_prop.png?g=1`]),
    }),
    // 【项目·山海志 · 空壳】山鬼·战斗造型（只有提示词，参考图预置山鬼素模，等生成）
    asset({
      id: 'a_shangui_battle', category: 'character', name: '山鬼·战斗造型',
      scope: 'project', scopeId: IDS.projShanhai,
      status: 'empty', cover: '',
      // 山海志没有服装资产，正好演示"服装参考图是可选的"：只有 1 张素模参考图。
      referenceImages: [`${IMG}/character-base/shangui_base.png`],
      referenceLabels: ['素模'],
      referencedFrom: 'a_shangui',
      fields: { style: '国风' },
      createdAt: 1_784_810_000_000,
    }),

    /* 【项目·都市迷案 1】林警官（=广场赛博女警 直接复用改名而来，masterId 记录血缘）*/
    asset({
      id: 'a_linjingguan', category: 'character', name: '林警官', scope: 'project', scopeId: IDS.projUrban,
      cover: `${IMG}/proj-urban-mystery/linjingguan_look_cyberjacket.png`,
      // 从广场直接复用来的副本，天然只带定稿这一张、没有生产过程 → 候选池仅定稿。
      candidates: cands([`${IMG}/proj-urban-mystery/linjingguan_look_cyberjacket.png`]),
      masterId: 'a_cyber_police', fields: { gender: '女', style: '赛博' },
    }),

    /* 【项目·星际公约 1】（团队B）*/
    asset({
      id: 'a_captain', category: 'character', name: '星舰船长', scope: 'project', scopeId: IDS.projStar,
      cover: `${IMG}/character-base/starship_captain_base.png?g=1`,
      candidates: cands([`${IMG}/character-base/starship_captain_base.png?g=1`]),
      fields: { style: '科幻' },
    }),

    /* 【项目·孤舟 1】（Solo）*/
    asset({
      id: 'a_indie_lead', category: 'character', name: '孤舟主角', scope: 'project', scopeId: IDS.projBoat,
      cover: `${IMG}/character-base/indie_lead_base.png?g=1`,
      candidates: cands([`${IMG}/character-base/indie_lead_base.png?g=1`]),
    }),

    /* 【音频 · 占位】三层各铺几段，让画布资产面板的「音频」类目有内容可展示 */
    // 广场·官方 BGM 货架
    audioAsset('a_bgm_guofeng', '古风悠扬', 'plaza', undefined, '2:34', 0),
    audioAsset('a_bgm_moonwine', '月下独酌', 'plaza', undefined, '4:01', 1),
    audioAsset('a_bgm_birdsong', '空山鸟语', 'plaza', undefined, '3:12', 0),
    // 团队A·团队库
    audioAsset('a_bgm_rainalley', '雨巷回声', 'team', IDS.teamA, '2:58', 1),
    audioAsset('a_bgm_dawn', '晨曦微光', 'team', IDS.teamA, '3:40', 0),
    // 项目·霓虹东京（赛博）
    audioAsset('a_bgm_neonpulse', '霓虹脉冲', 'project', IDS.projNeon, '3:05', 1),
    audioAsset('a_bgm_cyberrain', '赛博夜雨', 'project', IDS.projNeon, '2:47', 0),
    // 项目·山海志（国风）
    audioAsset('a_bgm_bamboo', '竹林清音', 'project', IDS.projShanhai, '3:20', 0),
  ]

  return { users, teams, projects, canvases, assets }
}

/* ═══════════════════════════════════════════════════════════════════════
 * 【演示脚手架 · 0805】DEMO_NEON_ASSETS —— 霓虹东京的一批资产（成品 5 + 空壳 3）
 * ───────────────────────────────────────────────────────────────────────
 * 种子里霓虹东京的角色/服装/场景/道具四类起始为空；点「演示 → 资产生成」时，
 * store 把这一批一次性灌进 world.assets（runDemoGenerate），「重置演示」按 id 过滤掉。
 * 这不是产品数据，只是演示时"从无到有长出资产"的脚手架，交付时随演示控件一并移除。
 *
 * 候选池恒 1（只展示定稿 · 改动三）：候选池是"演出来的"——用户点生成、保留后才涨。
 * 素模的参考图 = 它自己的定稿图（改动五 5.1）；造型的参考图标签写被参考资产的真名（规则 20）。
 * ═══════════════════════════════════════════════════════════════════════ */
export const DEMO_NEON_ASSETS: Asset[] = [
  /* ── 成品 5（角色 2 · 服装 1 · 场景 1 · 道具 1）── */
  asset({
    id: 'a_ajie', category: 'character', name: '阿杰', scope: 'project', scopeId: IDS.projNeon,
    cover: `${IMG}/character-base/ajie_base.png?g=1`, // 定稿 = 原素模
    candidates: cands([`${IMG}/character-base/ajie_base.png?g=1`]), // 与 cover 同一张，池中恒 1
    referenceImages: [`${IMG}/character-base/ajie_base.png`], // 素模的参考图就是它自己
    referenceLabels: ['阿杰'],
    fields: { gender: '男', style: '赛博' },
    createdAt: 1_784_900_000_000,
  }),
  asset({
    id: 'a_neon_dancer', category: 'character', name: '霓虹舞者', scope: 'project', scopeId: IDS.projNeon,
    cover: `${IMG}/character-base/neon_dancer_base.png?g=1`,
    candidates: cands([`${IMG}/character-base/neon_dancer_base.png?g=1`]),
    referenceImages: [`${IMG}/character-base/neon_dancer_base.png`],
    referenceLabels: ['霓虹舞者'],
    fields: { gender: '女', style: '赛博' },
    createdAt: 1_784_890_000_000,
  }),
  asset({
    id: 'a_mech_exo', category: 'costume', name: '机甲外骨骼', scope: 'project', scopeId: IDS.projNeon,
    cover: `${IMG}/proj-neon-tokyo/mech_exoskeleton_costume.png?g=1`, fields: { style: '科幻' },
    candidates: cands([`${IMG}/proj-neon-tokyo/mech_exoskeleton_costume.png?g=1`]),
    createdAt: 1_784_880_000_000,
  }),
  asset({
    id: 'a_neon_bar', category: 'scene', name: '霓虹酒吧', scope: 'project', scopeId: IDS.projNeon,
    cover: `${IMG}/proj-neon-tokyo/neon_bar_scene.png?g=1`, fields: { style: '赛博' },
    candidates: cands([`${IMG}/proj-neon-tokyo/neon_bar_scene.png?g=1`]),
    createdAt: 1_784_870_000_000,
  }),
  asset({
    id: 'a_mech_prosthetic', category: 'prop', name: '机械义肢', scope: 'project', scopeId: IDS.projNeon,
    cover: `${IMG}/proj-neon-tokyo/mech_prosthetic_prop.png?g=1`, fields: { style: '科幻' },
    candidates: cands([`${IMG}/proj-neon-tokyo/mech_prosthetic_prop.png?g=1`]),
    createdAt: 1_784_860_000_000,
  }),

  /* ── 空壳 3（穿衣服的造型，只有提示词没有图，等用户点生成）──
     参考图有序：第 1 张素模、第 2 张服装；标签写被参考资产的真名（规则 20）。 */
  asset({
    id: 'a_ajie_trench', category: 'character', name: '阿杰·风衣造型',
    scope: 'project', scopeId: IDS.projNeon,
    status: 'empty', cover: '',
    referenceImages: [
      `${IMG}/character-base/ajie_base.png`,
      `${IMG}/proj-neon-tokyo/mech_exoskeleton_costume.png`,
    ],
    referenceLabels: ['阿杰', '机甲外骨骼'],
    referencedFrom: 'a_ajie',
    fields: { gender: '男', style: '赛博', lookUrl: `${IMG}/proj-neon-tokyo/ajie_role.png` },
    createdAt: 1_784_850_000_000,
  }),
  asset({
    id: 'a_ajie_battle', category: 'character', name: '阿杰·战损造型',
    scope: 'project', scopeId: IDS.projNeon,
    status: 'empty', cover: '',
    referenceImages: [
      `${IMG}/character-base/ajie_base.png`,
      `${IMG}/proj-neon-tokyo/mech_exoskeleton_costume.png`,
    ],
    referenceLabels: ['阿杰', '机甲外骨骼'],
    referencedFrom: 'a_ajie',
    fields: { gender: '男', style: '赛博', lookUrl: `${IMG}/proj-neon-tokyo/ajie_role.png` },
    createdAt: 1_784_840_000_000,
  }),
  asset({
    id: 'a_dancer_stage', category: 'character', name: '霓虹舞者·舞台造型',
    scope: 'project', scopeId: IDS.projNeon,
    status: 'empty', cover: '',
    referenceImages: [
      `${IMG}/character-base/neon_dancer_base.png`,
      `${IMG}/proj-neon-tokyo/mech_exoskeleton_costume.png`,
    ],
    referenceLabels: ['霓虹舞者', '机甲外骨骼'],
    referencedFrom: 'a_neon_dancer',
    fields: { gender: '女', style: '赛博', lookUrl: `${IMG}/proj-neon-tokyo/neon_dancer_role.png` },
    createdAt: 1_784_830_000_000,
  }),
]

/** DEMO_NEON_ASSETS 的 id 集合（runDemoReset 精确过滤用：只删这一批，不碰音频 /「其他」）。 */
export const DEMO_NEON_IDS = new Set(DEMO_NEON_ASSETS.map((a) => a.id))

/* ─── 一些测试/界面里常用的取数小助手 ─── */

export function userById(world: World, id: string): User {
  const u = world.users.find((x) => x.id === id)
  if (!u) throw new Error(`种子数据里没有用户 ${id}`)
  return u
}

export function assetById(world: World, id: string): Asset {
  const a = world.assets.find((x) => x.id === id)
  if (!a) throw new Error(`种子数据里没有资产 ${id}`)
  return a
}

export function projectById(world: World, id: string): Project {
  const p = world.projects.find((x) => x.id === id)
  if (!p) throw new Error(`种子数据里没有项目 ${id}`)
  return p
}
