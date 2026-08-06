/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 预置音色库】presetVoices.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 本期预置音色库：六个中文音色（3 男 3 女），各带真实可试听音源（mp3 放在 public/assets/voices/）。
 * 音源取自 AISHELL-3 多说话人普通话语料（openslr.org/93，Apache-2.0，可商用），
 * 按性别 + 年龄段匹配挑人、各截 ~5s（说话人 ID 见每条 speakerId 注释）。
 * 未来会扩成豆包预置库 + 团队复刻池——那时这里换成从后端拉，接口形状不变（还是 Voice[]）。
 * ─────────────────────────────────────────────────────────────────────── */

import type { Voice } from './types'
import { assetUrl } from '../utils/assets'

/** 本期预置音色库：3 男 3 女，各带真实可试听音源（AISHELL-3 · Apache-2.0）。 */
export const PRESET_VOICES: Voice[] = [
  {
    id: 'preset_v01', // AISHELL-3 SSB0273 · male · 14-25 · north
    type: 'preset',
    name: '青涩少年',
    gender: '男',
    previewUrl: assetUrl('assets/voices/v01_qingse-shaonian_male.mp3'),
  },
  {
    id: 'preset_v02', // AISHELL-3 SSB0710 · male · 26-40 · north
    type: 'preset',
    name: '清朗青年',
    gender: '男',
    previewUrl: assetUrl('assets/voices/v02_qinglang-qingnian_male.mp3'),
  },
  {
    id: 'preset_v03', // AISHELL-3 SSB0434 · male · >41 · north
    type: 'preset',
    name: '磁性大叔',
    gender: '男',
    previewUrl: assetUrl('assets/voices/v03_cixing-dashu_male.mp3'),
  },
  {
    id: 'preset_v04', // AISHELL-3 SSB0578 · female · 14-25 · north
    type: 'preset',
    name: '元气少女',
    gender: '女',
    previewUrl: assetUrl('assets/voices/v04_yuanqi-shaonv_female.mp3'),
  },
  {
    id: 'preset_v05', // AISHELL-3 SSB0534 · female · 26-40 · north
    type: 'preset',
    name: '御姐',
    gender: '女',
    previewUrl: assetUrl('assets/voices/v05_yujie_female.mp3'),
  },
  {
    id: 'preset_v06', // AISHELL-3 SSB0666 · female · 26-40 · north
    type: 'preset',
    name: '知性女声',
    gender: '女',
    previewUrl: assetUrl('assets/voices/v06_zhixing-nvsheng_female.mp3'),
  },
]

export const presetVoiceById = (id: string) => PRESET_VOICES.find((v) => v.id === id)
