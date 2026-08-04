/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 种子数据】seed.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 一份能驱动界面、也能验证规则的假数据（World）。
 *
 * 【精简版】演示范围收敛到「一个团队 · 一个项目」：
 *   · 团队：Sunny 的团队（1 个）
 *   · 项目：都市日常（1 个）
 *   · 遗留素材 40 份对半分：素材广场 20（成品货架）/ 团队资产库 20（素模母版 + 造型沉淀）
 *   · 项目里四大类起始为空 —— 由演示脚手架（demoProject.ts）现场"长"出来
 *
 * 图片路径约定：图片放在 public/assets/ 下，通过 assetUrl() 生成 URL。
 *   plaza/        素材广场货架（20）
 *   team/         团队资产库母版（20）
 *   proj-daily/   都市日常项目素材（每份资产一个目录，1.png 恒为定稿）
 *
 * createSeedWorld() 每次返回一份全新的 World，测试之间互不污染。
 * ─────────────────────────────────────────────────────────────────────── */

import type { World, User, Team, Project, Canvas, Asset, Candidate, Category, Scope } from './types'
import { PRESET_VOICES } from './presetVoices'
import { assetUrl } from '../utils/assets'

/** 图片根目录：所有 cover 都以它开头。 */
const IMG = assetUrl('assets')

/* ─── 演示用提示词模板 ─────────────────────────────────────────────────
 * 演示阶段只按类目对号入座：所有角色/造型共用同一段【人物】模板，服装共用【服装】模板，
 * 以此类推。原样照抄、保留方括号占位、不按资产个性化改写。素模与造型不区分。 */
export const PROMPT_CHARACTER = `【性别】+【年龄段】的角色，【脸型】，【五官特征描述，如眉眼、鼻唇】，【肤色与肤质】。【发型 + 发色 + 发饰状态】，【表情与眼神情绪】。【身材比例与体态】，【姿势动作，如站/坐/回眸/伸手】，整体呈现【气质定位，如清冷/温婉/英气/慵懒】。补充【视角与构图，如正面/三分侧脸/半身/全身】，【光影类型，如柔光/侧逆光/电影感布光】。画质要求：高清写实/插画/二次元等风格，皮肤与发丝细节清晰，睫毛纹理分明，背景虚化突出主体。`
export const PROMPT_COSTUME = `一套【服装类型 + 整体风格，如古风襦裙/现代西装/未来机能】，【主体颜色 + 辅助配色】。【上装描述：领型、袖型、版型】，【下装或整体轮廓】。【面料材质，如真丝/棉麻/皮革/金属】，呈现对应的【质感与垂坠或硬挺感】。【装饰细节：刺绣/印花/滚边/金属扣/流苏等及其位置】。【配饰：腰带、披风、外搭及其状态】。整体配色基调为【冷/暖/高级灰等】，风格【清雅/华丽/简约/繁复】。画质要求：面料纹理清晰，刺绣与细节可见，自然光下真实的材质质感与光影层次。`
export const PROMPT_SCENE = `【时间 + 季节 + 天气】的【地点类型，如庭院/街道/森林/室内/异世界】。【主体建筑或环境结构描述】，【近景元素，如水池、桌椅、植物、器物】。【中远景元素，如远山、楼宇、天空】。【氛围光线，如晨光/暮色/月光/灯火】，营造出【整体氛围，如静谧/热闹/苍凉/梦幻】。补充【色调倾向，如青绿/暖黄/冷蓝】，【景深与空间层次】。画质要求：环境细节丰富，光影自然通透，空间纵深感强，电影级场景氛围，与人物主体和谐融合，背景服务于整体意境。`
export const PROMPT_PROP = `一件【道具类型，如武器/器皿/乐器/书卷/法器/日常物件】，【整体造型与轮廓】。【主体材质，如金属/木质/玉石/陶瓷/织物】，【颜色与光泽感】。【表面纹样或雕刻细节，如花纹、符文、铭文及其分布】。【尺寸比例与结构部件】，【使用或摆放状态，如手持/悬浮/置于台上】。【附加元素，如光效、流苏、镶嵌宝石、磨损痕迹】，体现【道具的年代感或功能属性】。画质要求：材质质感真实，细节纹理清晰，光影反射自然，主体突出，可作为特写或点缀元素融入画面。`

/** 类目 → 演示提示词模板。 */
const PROMPT_BY_CATEGORY: Record<Category, string> = {
  character: PROMPT_CHARACTER,
  costume: PROMPT_COSTUME,
  scene: PROMPT_SCENE,
  prop: PROMPT_PROP,
  audio: '',
  other: '', // 「其他」是存进来的成品留存物，不由提示词生成。
}

/* ─── 账号 / 团队 / 项目 id 常量（集中定义，避免裸字符串写错）─── */
export const IDS = {
  admin: 'u_admin',
  sunny: 'u_sunny', // 主账号（默认视角，内容最全）
  lin: 'u_lin',     // 子账号，已分配到「都市日常」
  may: 'u_may',     // 子账号，未分配任何项目（演"看不到没分配的项目"）

  teamA: 'team_a',

  projDaily: 'proj_daily', // 都市日常（唯一项目）
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
    prompt: PROMPT_BY_CATEGORY[partial.category],
    createdAt: 0,
    ...partial,
  }
}

/* ─── 候选池小助手：把一串图片 url 变成候选图数组。
 * 定稿图（asset.cover）必定也在池中——把定稿那张放在数组首位即可。 */
let _candSeq = 1
export function cands(urls: string[]): Candidate[] {
  return urls.map((url) => ({ id: `cand_seed_${_candSeq++}`, url, createdAt: 0 }))
}

/* ─── 音频资产小助手 ───────────────────────────────────────────────────
 * 音频没有封面图 → 统一给一张波形占位图；可播放音源与时长塞进 fields。
 * 本期没有真实 BGM 素材，音源先复用两段预置音色 mp3 占位（能真的点开试听）。 */
const AUDIO_SRC = [
  `${IMG}/voices/preset_voice_female.mp3`,
  `${IMG}/voices/preset_voice_male.mp3`,
]
const AUDIO_COVER = `${IMG}/canvas/audio-placeholder.svg`
function audioAsset(
  id: string, name: string, scope: Scope, scopeId: string | undefined, duration: string, srcIdx: number,
): Asset {
  return asset({
    id, category: 'audio', name, scope, scopeId, cover: AUDIO_COVER,
    fields: { duration, audioUrl: AUDIO_SRC[srcIdx % AUDIO_SRC.length] },
  })
}

/* ─── 「其他」类目小助手（仅项目库）─────────────────────────────────────
 * 创作过程的留存物（分镜图 / 视频片段 / 剧本文本），媒介写进 fields.media。
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

/** 演示用剧本正文，给「第一幕剧本·客厅对峙」这份文本类「其他」资产。 */
const SCRIPT_LIVING_ROOM = `【第一幕 · 客厅对峙】

午后的光斜切过落地窗，把客厅分成明暗两半。苏可靠在沙发扶手上，手里的马克杯早就凉了。

门开了。阿杰站在玄关，西装外套搭在手臂上，领带松着，像是一路小跑上来的。

"你什么时候回来的？"她没抬头。

"刚下飞机。"他把外套放在椅背上，"你手机一直关机。"

茶几上那部手机屏幕朝下扣着，安静得过分。苏可终于看了他一眼："因为我不想接。"

阿杰在她对面坐下，两人之间隔着一张矮桌，和三个月没说完的话。窗外的城市在下午四点的光里慢慢变暖。`

export function createSeedWorld(): World {
  /* ── 用户：1 个 admin + 1 个主账号 + 2 个子账号 ── */
  const users: User[] = [
    { id: IDS.admin, name: 'Admin', avatar: `${IMG}/avatars/admin_avatar.png`, role: 'admin' },
    { id: IDS.sunny, name: 'Sunny', avatar: `${IMG}/avatars/sunny_avatar.png`, role: 'owner', teamId: IDS.teamA },
    { id: IDS.lin, name: '小林', avatar: `${IMG}/avatars/xiaolin_avatar.png`, role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
    { id: IDS.may, name: '阿May', avatar: `${IMG}/avatars/amay_avatar.png`, role: 'sub', teamId: IDS.teamA, parentId: IDS.sunny },
  ]

  /* ── 团队：只剩一个（门 A 团队库对子账号默认开放）── */
  const teams: Team[] = [{ id: IDS.teamA, ownerId: IDS.sunny }]

  /* ── 项目：只剩一个 ── */
  const projects: Project[] = [
    {
      id: IDS.projDaily, name: '都市日常', tag: '写实', teamId: IDS.teamA,
      cover: `${IMG}/project-covers/urban_mystery_cover.png`,
      createdAt: 1_721_620_000_000,
      assignedSubs: [IDS.lin], // 阿May 没被分配 → 演"子账号看不到没分配的项目"
    },
  ]

  /* ── 画布：项目下的"无限画布"草稿台 ── */
  const canvases: Canvas[] = [
    { id: 'cv_daily_1', projectId: IDS.projDaily, name: '开场·客厅', cover: `${IMG}/proj-daily/living-room/1.png`, createdAt: 1_721_620_000_000 },
    { id: 'cv_daily_2', projectId: IDS.projDaily, name: '对话分镜', cover: `${IMG}/project-covers/urban_mystery_cover.png`, createdAt: 1_721_450_000_000 },
  ]

  /* ── 资产 ─────────────────────────────────────────────────────── */
  const assets: Asset[] = [
    /* ══ 素材广场 · 官方成品货架 20 ══
       广场只陈列定稿成品（规则 14）：不带候选池、上架后不可编辑。 */
    // 角色 3
    asset({ id: 'a_cyber_police', category: 'character', name: '赛博女警', scope: 'plaza', cover: `${IMG}/plaza/cyber_police.png`, fields: { gender: '女', age: '青年', style: '赛博' }, voice: { ...PRESET_VOICES[0] } }),
    asset({ id: 'a_swordsman', category: 'character', name: '东方剑客', scope: 'plaza', cover: `${IMG}/plaza/eastern_swordsman.png`, fields: { gender: '男', age: '青年', style: '国风' } }),
    asset({ id: 'a_mech_butler', category: 'character', name: '机械管家', scope: 'plaza', cover: `${IMG}/plaza/mech_butler.png`, fields: { style: '科幻' } }),
    // 角色造型 6
    asset({ id: 'a_cyber_police_home', category: 'character', name: '赛博女警·居家造型', scope: 'plaza', cover: `${IMG}/plaza/cyber_police_home.png`, referencedFrom: 'a_cyber_police', referenceImages: [`${IMG}/plaza/cyber_police.png`], referenceLabels: ['赛博女警'], fields: { gender: '女', style: '赛博' } }),
    asset({ id: 'a_urban_man_suit', category: 'character', name: '都市男青年·西装造型', scope: 'plaza', cover: `${IMG}/plaza/urban_man_suit.png`, fields: { gender: '男', age: '青年', style: '写实' } }),
    asset({ id: 'a_neon_dancer_stage', category: 'character', name: '霓虹舞者·舞台造型', scope: 'plaza', cover: `${IMG}/plaza/neon_dancer_stage.png`, fields: { gender: '女', style: '赛博' } }),
    asset({ id: 'a_shangui_battle', category: 'character', name: '山鬼·战斗造型', scope: 'plaza', cover: `${IMG}/plaza/shangui_battle.png`, fields: { style: '国风' } }),
    asset({ id: 'a_captain_uniform', category: 'character', name: '星舰船长·制服造型', scope: 'plaza', cover: `${IMG}/plaza/captain_uniform.png`, fields: { style: '科幻' } }),
    asset({ id: 'a_indie_lead_sail', category: 'character', name: '孤舟主角·出海造型', scope: 'plaza', cover: `${IMG}/plaza/indie_lead_sail.png`, fields: { style: '写实' } }),
    // 服装 3
    asset({ id: 'a_police_uniform', category: 'costume', name: '女警制服', scope: 'plaza', cover: `${IMG}/plaza/police_uniform.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_swordsman_robe', category: 'costume', name: '剑客长袍', scope: 'plaza', cover: `${IMG}/plaza/swordsman_robe.png`, fields: { style: '国风' } }),
    asset({ id: 'a_mech_exoskeleton', category: 'costume', name: '机甲外骨骼', scope: 'plaza', cover: `${IMG}/plaza/mech_exoskeleton.png`, fields: { style: '科幻' } }),
    // 场景 4
    asset({ id: 'a_cyber_street', category: 'scene', name: '赛博街市', scope: 'plaza', cover: `${IMG}/plaza/cyber_street.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_rainy_rooftop', category: 'scene', name: '雨夜天台', scope: 'plaza', cover: `${IMG}/plaza/rainy_rooftop.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_neon_bar', category: 'scene', name: '霓虹酒吧', scope: 'plaza', cover: `${IMG}/plaza/neon_bar.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_bamboo_forest', category: 'scene', name: '竹林', scope: 'plaza', cover: `${IMG}/plaza/bamboo_forest.png`, fields: { style: '国风' } }),
    // 道具 4
    asset({ id: 'a_holo_bracelet', category: 'prop', name: '全息手环', scope: 'plaza', cover: `${IMG}/plaza/holo_bracelet.png`, fields: { style: '赛博' } }),
    asset({ id: 'a_lightsaber', category: 'prop', name: '光剑', scope: 'plaza', cover: `${IMG}/plaza/lightsaber.png`, fields: { style: '科幻' } }),
    asset({ id: 'a_mech_prosthetic', category: 'prop', name: '机械义肢', scope: 'plaza', cover: `${IMG}/plaza/mech_prosthetic.png`, fields: { style: '科幻' } }),
    asset({ id: 'a_token', category: 'prop', name: '令牌', scope: 'plaza', cover: `${IMG}/plaza/token.png`, fields: { style: '国风' } }),

    /* ══ 团队资产库 · 母版层 20 ══
       团队库只展示定稿（规则 14）：它不能生成（规则 15），资产都是从项目存入上来的副本，
       跨层流转只带定稿 —— 所以结构上就不该有候选池，生产过程一律留在项目层。
       素模（10）全部归这一层；造型（6）是团队沉淀下来的成片。 */
    // 角色 · 素模 10
    asset({ id: 'a_suwan', category: 'character', name: '苏晚', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/suwan.png`, fields: { gender: '女', age: '青年', style: '国风' }, voice: { ...PRESET_VOICES[0] }, createdAt: 1_785_000_000_000 }),
    asset({ id: 'a_oldk', category: 'character', name: '老K', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/oldk.png`, fields: { gender: '男', age: '中年' }, voice: { ...PRESET_VOICES[1] }, createdAt: 1_784_960_000_000 }),
    asset({ id: 'a_urban_man', category: 'character', name: '都市男青年', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/urban_man.png`, fields: { gender: '男', age: '青年', style: '写实' }, createdAt: 1_784_920_000_000 }),
    asset({ id: 'a_neon_dancer', category: 'character', name: '霓虹舞者', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/neon_dancer.png`, fields: { gender: '女', age: '青年', style: '赛博' }, createdAt: 1_784_880_000_000 }),
    asset({ id: 'a_shangui', category: 'character', name: '山鬼', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/shangui.png`, fields: { style: '国风' }, createdAt: 1_784_840_000_000 }),
    asset({ id: 'a_captain', category: 'character', name: '星舰船长', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/starship_captain.png`, fields: { style: '科幻' }, createdAt: 1_784_800_000_000 }),
    asset({ id: 'a_indie_lead', category: 'character', name: '孤舟主角', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/indie_lead.png`, fields: { style: '写实' }, createdAt: 1_784_760_000_000 }),
    asset({ id: 'a_cyber_police_base', category: 'character', name: '赛博女警·素模', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/cyber_police_base.png`, masterId: 'a_cyber_police', fields: { gender: '女', style: '赛博' }, createdAt: 1_784_720_000_000 }),
    asset({ id: 'a_swordsman_base', category: 'character', name: '东方剑客·素模', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/eastern_swordsman_base.png`, masterId: 'a_swordsman', fields: { gender: '男', style: '国风' }, createdAt: 1_784_680_000_000 }),
    asset({ id: 'a_mech_butler_base', category: 'character', name: '机械管家·素模', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/mech_butler_base.png`, masterId: 'a_mech_butler', fields: { style: '科幻' }, createdAt: 1_784_640_000_000 }),
    // 角色造型 6
    asset({ id: 'a_suwan_final', category: 'character', name: '苏晚·成片造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/suwan_final.png`, referencedFrom: 'a_suwan', referenceImages: [`${IMG}/team/suwan.png`], referenceLabels: ['苏晚'], fields: { gender: '女', age: '青年', style: '国风' }, createdAt: 1_784_600_000_000 }),
    asset({ id: 'a_suwan_guofeng', category: 'character', name: '苏晚·国风造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/suwan_guofeng.png`, referencedFrom: 'a_suwan', referenceImages: [`${IMG}/team/suwan.png`, `${IMG}/team/palace_dress.png`], referenceLabels: ['苏晚', '国风宫装'], fields: { gender: '女', age: '青年', style: '国风' }, createdAt: 1_784_560_000_000 }),
    asset({ id: 'a_suwan_casual', category: 'character', name: '苏晚·休闲造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/suwan_casual.png`, referencedFrom: 'a_suwan', referenceImages: [`${IMG}/team/suwan.png`], referenceLabels: ['苏晚'], fields: { gender: '女', age: '青年' }, createdAt: 1_784_520_000_000 }),
    asset({ id: 'a_suwan_cyber', category: 'character', name: '苏晚·赛博造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/suwan_cyber.png`, referencedFrom: 'a_suwan', referenceImages: [`${IMG}/team/suwan.png`, `${IMG}/team/cyber_jacket.png`], referenceLabels: ['苏晚', '赛博夹克'], fields: { gender: '女', age: '青年', style: '赛博' }, createdAt: 1_784_480_000_000 }),
    asset({ id: 'a_oldk_trench', category: 'character', name: '老K·风衣造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/oldk_trench.png`, referencedFrom: 'a_oldk', referenceImages: [`${IMG}/team/oldk.png`], referenceLabels: ['老K'], fields: { gender: '男', age: '中年' }, createdAt: 1_784_440_000_000 }),
    asset({ id: 'a_linjingguan_jacket', category: 'character', name: '林警官·夹克造型', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/linjingguan_jacket.png`, masterId: 'a_cyber_police', referenceImages: [`${IMG}/team/cyber_jacket.png`], referenceLabels: ['赛博夹克'], fields: { gender: '女', style: '赛博' }, createdAt: 1_784_400_000_000 }),
    // 服装 2 / 场景 1 / 道具 1
    asset({ id: 'a_cyber_jacket', category: 'costume', name: '赛博夹克', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/cyber_jacket.png`, fields: { style: '赛博' }, createdAt: 1_784_300_000_000 }),
    asset({ id: 'a_palace_dress', category: 'costume', name: '国风宫装', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/palace_dress.png`, fields: { style: '国风' }, createdAt: 1_784_000_000_000 }),
    asset({ id: 'a_ancient_dock', category: 'scene', name: '古镇码头', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/ancient_dock.png`, fields: { style: '国风' }, createdAt: 1_783_700_000_000 }),
    asset({ id: 'a_folding_fan', category: 'prop', name: '折扇', scope: 'team', scopeId: IDS.teamA, cover: `${IMG}/team/folding_fan.png`, fields: { style: '国风' }, createdAt: 1_783_400_000_000 }),

    /* ══ 项目 · 都市日常 ══
       角色 / 服装 / 场景 / 道具四类**起始为空**，由「演示 → 剧本分析 / 资产生成」
       现场灌入（见 demoProject.ts）。种子里只留「其他」留存物与音频。 */
    // 「其他」4：创作过程的留存物（图 / 图 / 视频 / 文本），仅存本项目、不向上流转
    otherAsset('a_other_grid', '第一场·九宫格分镜', IDS.projDaily, 'image', `${IMG}/proj-daily/other/storyboard_grid.png`),
    otherAsset('a_other_plot', '完整情节故事板', IDS.projDaily, 'image', `${IMG}/proj-daily/other/plot_board.png`),
    otherAsset('a_other_clip', '客厅对话·分镜片段', IDS.projDaily, 'video', `${IMG}/proj-daily/other/clip_poster.png`, '0:12'),
    otherAsset('a_other_script', '第一幕剧本·客厅对峙', IDS.projDaily, 'text', SCRIPT_LIVING_ROOM),

    /* ══ 音频 ══ 三层各铺几段，让画布资产面板的「音频」类目有内容可展示 */
    // 广场 · 官方 BGM 货架 3
    audioAsset('a_bgm_guofeng', '古风悠扬', 'plaza', undefined, '2:34', 0),
    audioAsset('a_bgm_moonwine', '月下独酌', 'plaza', undefined, '4:01', 1),
    audioAsset('a_bgm_birdsong', '空山鸟语', 'plaza', undefined, '3:12', 0),
    // 团队库 2
    audioAsset('a_bgm_rainalley', '雨巷回声', 'team', IDS.teamA, '2:58', 1),
    audioAsset('a_bgm_dawn', '晨曦微光', 'team', IDS.teamA, '3:40', 0),
    // 项目 · 都市日常 2
    audioAsset('a_bgm_morning', '城市清晨', 'project', IDS.projDaily, '3:05', 1),
    audioAsset('a_bgm_rainwindow', '窗外雨声', 'project', IDS.projDaily, '2:47', 0),
  ]

  return { users, teams, projects, canvases, assets }
}

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
