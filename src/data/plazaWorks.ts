/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 素材广场作品墙】plazaWorks.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 素材广场顶部「作品」区展示的短片，纯陈列用假数据——
 * 它们是别的创作者用广场素材搭出来的成片，只作展示 / 播放页占位，
 * 不属于资产领域模型（World 里没有"作品"这层），所以单独放这里，
 * 跟 presetVoices 一样是"界面素材"，不碰逻辑内核（权限 / 流转 / 测试都不受影响）。
 *
 * 封面复用现有 project-covers（5 张成片封面），作者头像复用 avatars。
 * 未来接后端时，这里换成从"作品广场"接口拉一个 PlazaWork[]，形状不变，页面不用动。
 * ─────────────────────────────────────────────────────────────────────── */

export interface PlazaWork {
  id: string
  title: string
  cover: string     // 成片封面（16:9）
  author: string    // 作者昵称
  avatar: string    // 作者头像
  dur: string       // 时长，如 "00:48"
  plays: string     // 播放量展示串，如 "1.2w"
  likes: number     // 点赞数（用于卡片右下角红心 + 播放页收藏计数）
  date: string      // 发布时间展示串，如 "2 天前"
  desc: string      // 播放页简介：讲清用了广场哪几份素材
}

const IMG = assetUrl('assets')

export const PLAZA_WORKS: PlazaWork[] = [
  {
    id: 'w_neon_tokyo',
    title: '霓虹东京 · 雨夜开场',
    cover: `${IMG}/project-covers/neon_tokyo_cover.png`,
    author: '阿泽',
    avatar: `${IMG}/avatars/aze_avatar.png`,
    dur: '00:48',
    plays: '1.2w',
    likes: 12800,
    date: '2 天前',
    desc: '赛博都市雨夜开场，用广场「赛博女警」+「雨夜天台」两份官方素材搭建。测试霓虹光比与雨丝质感。',
  },
  {
    id: 'w_urban_mystery',
    title: '都市迷案 · 命案现场',
    cover: `${IMG}/project-covers/urban_mystery_cover.png`,
    author: 'Sunny',
    avatar: `${IMG}/avatars/sunny_avatar.png`,
    dur: '00:36',
    plays: '2.1w',
    likes: 17600,
    date: '3 天前',
    desc: '悬疑短片片段，写实风格光影调度，主角「林警官」由广场「赛博女警」直接复用改造而来。',
  },
  {
    id: 'w_star_covenant',
    title: '星际公约 · 启航',
    cover: `${IMG}/project-covers/starcovenant_cover.png`,
    author: '小鹿',
    avatar: `${IMG}/avatars/xiaolu_avatar.png`,
    dur: '01:05',
    plays: '5401',
    likes: 6800,
    date: '5 天前',
    desc: '科幻星舰启航长镜头，用广场「机械管家」在大场景下测试运动一致性。',
  },
  {
    id: 'w_shanhai',
    title: '山海志 · 竹林初见',
    cover: `${IMG}/project-covers/shanhai_cover.png`,
    author: '老周',
    avatar: `${IMG}/avatars/laozhou_avatar.png`,
    dur: '01:12',
    plays: '8632',
    likes: 9400,
    date: '1 周前',
    desc: '国风竹林邂逅，「东方剑客」× 广场「剑客长袍」造型，柔光与雾气氛围测试。',
  },
  {
    id: 'w_lone_boat',
    title: '孤舟 · 夜航',
    cover: `${IMG}/project-covers/loneboat_cover.png`,
    author: '小林',
    avatar: `${IMG}/avatars/xiaolin_avatar.png`,
    dur: '00:52',
    plays: '3300',
    likes: 3300,
    date: '1 周前',
    desc: '水墨夜航独白，暖冷对比布光，用广场「雨夜天台」改置换的江面场景。',
  },
  {
    id: 'w_cyber_street',
    title: '赛博街市漫游',
    cover: `${IMG}/project-covers/neon_tokyo_cover.png`,
    author: '阿May',
    avatar: `${IMG}/avatars/amay_avatar.png`,
    dur: '00:41',
    plays: '990',
    likes: 990,
    date: '2 周前',
    desc: '第一人称街市漫游，用广场「赛博街市」测试镜头推进的画面稳定度。',
  },
]

/** 点赞 / 播放量的"万"制格式：12800 → 1.3万。 */
export const fmtLike = (v: number): string =>
  v >= 10000 ? `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}万` : String(v)
import { assetUrl } from '../utils/assets'
