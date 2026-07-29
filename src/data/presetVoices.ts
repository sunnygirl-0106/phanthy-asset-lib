/**
 * ═══════════════════════════════════════════════════════════════════════
 * 【数据层 · 预置音色库】presetVoices.ts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 本期预置音色库：一男一女，各带真实可试听音源（mp3 放在 public/assets/voices/）。
 * 未来会扩成豆包预置库 + 团队复刻池——那时这里换成从后端拉，接口形状不变（还是 Voice[]）。
 * ─────────────────────────────────────────────────────────────────────── */

import type { Voice } from './types'

/** 本期预置音色库：一男一女，各带真实可试听音源。 */
export const PRESET_VOICES: Voice[] = [
  {
    id: 'preset_voice_f01',
    type: 'preset',
    name: '清透女声',
    gender: '女',
    previewUrl: '/assets/voices/preset_voice_female.mp3',
  },
  {
    id: 'preset_voice_m01',
    type: 'preset',
    name: '沉稳男声',
    gender: '男',
    previewUrl: '/assets/voices/preset_voice_male.mp3',
  },
]

export const presetVoiceById = (id: string) => PRESET_VOICES.find((v) => v.id === id)
