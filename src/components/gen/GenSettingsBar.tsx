import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { IMAGE_MODELS, IMAGE_MODEL_IDS, lockedReason, PARAM_ORDER, type ImageModelId, type ImageParams, type ParamKey } from '../../data/imageModels'
import Overlay from './Overlay'
import { useTip } from './useTip'
import { IcBolt, IcCheck, IcChev, IcImage, IcLayers, IcMjS, IcPhanS, IcQuality, IcSeedanceS } from './icons'
import styles from './GenSettingsBar.module.css'

interface Props {
  model: ImageModelId
  params: ImageParams
  onModelChange: (m: ImageModelId) => void
  onParamsChange: (p: ImageParams) => void
  flash?: ParamKey[]
  disabled?: boolean
}

/** 名字后头的推荐胶囊只表示推荐，不代表会员资格或使用权限。 */
const RecommendationPill = ({ recommended }: { recommended?: boolean }) => recommended ? <em className={styles.mdlTier}>推荐</em> : null
/** 型号徽章：深色圆心 + 一圈银边，中间一枚白徽记。推荐状态由名字后的金胶囊说，环只说厂牌。 */
const ModelRing = ({ model, d }: { model: ImageModelId; d: number }) => {
  const vendor = IMAGE_MODELS[model].vendor
  const G = vendor === 'seedream' ? IcSeedanceS : vendor === 'midjourney' ? IcMjS : IcPhanS
  return <i className={styles.mdlRing} style={{ '--d': `${d}px` } as CSSProperties}>
    <i className={styles.mdlRingIn}><G size={Math.round(d * 0.56)} /></i>
  </i>
}
/** 比例那一枚小方框：框本身就是那个画幅，长边定死 15px，短边按比例收。 */
const RatioBox = ({ ratio }: { ratio: string }) => {
  const [w, h] = ratio.split(':').map(Number)
  const long = 15, short = Math.round((long * Math.min(w, h)) / Math.max(w, h))
  const [bw, bh] = w >= h ? [long, short] : [short, long]
  return <i className={styles.ratioBox} style={{ width: bw, height: bh }} />
}
interface ParamDisplay {
  name: string
  icon: (value: string | number) => ReactNode
  format: (value: string | number) => string
  optionIcon?: (value: string | number) => ReactNode
}
const PARAM_DISPLAY: Record<ParamKey, ParamDisplay> = {
  resolution: { name: '清晰度', icon: (v) => <IcQuality size={15} sw={1.9} lv={v === '1K' ? 1 : v === '2K' ? 2 : 3} />, format: String },
  ratio: { name: '比例', icon: (v) => <RatioBox ratio={String(v)} />, format: String, optionIcon: (v) => <RatioBox ratio={String(v)} /> },
  version: { name: '版本', icon: () => <IcLayers size={15} sw={1.9} />, format: String },
  speed: { name: '速度档', icon: () => <IcBolt size={15} sw={1.9} />, format: String },
  count: { name: '数量', icon: () => <IcImage size={15} sw={1.9} />, format: (v) => `${v} 张` },
}

interface Opt { k: string; label: string; on: boolean; glyph?: ReactNode; pick: () => void }
/** 一格参数 = 一枚图标 + 此刻的取值，点开在它正上方落一张小抽屉。锁定格保留并说明原因。 */
function Field({ id, open, setOpen, name, icon, value, opts, reason, say, flash, disabled }: {
  id: ParamKey; open: string | null; setOpen: (v: string | null) => void
  name: string; icon: ReactNode; value: string; opts: Opt[]; reason: string
  say: ReturnType<typeof useTip>['tip']; flash: boolean; disabled: boolean
}) {
  const at = useRef<HTMLButtonElement>(null)
  const on = open === id && !disabled && !reason
  const off = disabled || !!reason
  return <>
    <button type="button" ref={at} className={`${styles.field}${on ? ` ${styles.on}` : ''}${flash ? ` ${styles.flash}` : ''}`}
      {...say(disabled ? undefined : reason)} aria-label={`${name}：${value}${reason ? `（${reason}）` : ''}`}
      aria-expanded={reason ? undefined : on} aria-disabled={off || undefined}
      onClick={() => { if (!off) setOpen(on ? null : id) }}>
      <i className={styles.fieldIc}>{icon}</i><span>{value}</span>
    </button>
    {on && <Overlay anchor={at} label={name} className={styles.drop} onClose={() => setOpen(null)}>
      {opts.map((o) => <button type="button" key={o.k} className={o.on ? styles.on : ''} aria-pressed={o.on}
        onClick={() => { o.pick(); setOpen(null) }}>
        <span>{o.glyph && <i className={styles.optIc}>{o.glyph}</i>}{o.label}</span>
        {o.on && <IcCheck size={13} sw={2.6} />}
      </button>)}
    </Overlay>}
  </>
}

export default function GenSettingsBar({ model, params, onModelChange, onParamsChange, flash = [], disabled = false }: Props) {
  const modelButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  const { tip, node: tipNode } = useTip()
  const cap = IMAGE_MODELS[model]
  useEffect(() => { if (disabled) setOpen(null) }, [disabled])
  const field = { open, setOpen, say: tip, disabled }
  return <div className={styles.set}>
    {!disabled && tipNode}
    <button type="button" ref={modelButton} className={`${styles.mdl}${open === 'model' && !disabled ? ` ${styles.on}` : ''}`}
      aria-disabled={disabled || undefined} aria-label={`模型：${cap.label}`} aria-expanded={open === 'model' && !disabled}
      onClick={() => { if (!disabled) setOpen(open === 'model' ? null : 'model') }}>
      <ModelRing model={model} d={20} /><span className={styles.mdlName}>{cap.label}</span><RecommendationPill recommended={cap.recommended} />
      <IcChev size={12} className={styles.mdlChev} />
    </button>
    {PARAM_ORDER.filter((k) => cap.options[k]).map((k) => {
      const display = PARAM_DISPLAY[k]
      return <Field {...field} key={`${model}-${k}`} id={k} name={display.name}
        value={display.format(params[k])} icon={display.icon(params[k])}
        reason={lockedReason(model, k)} flash={flash.includes(k)}
        opts={cap.options[k]!.map((v) => ({
          k: String(v), label: display.format(v), on: v === params[k], glyph: display.optionIcon?.(v),
          pick: () => onParamsChange({ ...params, [k]: k === 'count' ? Number(v) : String(v) }),
        }))} />
    })}
    {open === 'model' && !disabled && <Overlay anchor={modelButton} label="选择模型" className={styles.mdlDrop} onClose={() => setOpen(null)}>
      {IMAGE_MODEL_IDS.map((m) => {
        const c = IMAGE_MODELS[m], on = m === model
        return <button type="button" key={m} className={`${styles.mdlRow}${on ? ` ${styles.on}` : ''}`}
          aria-label={`${c.label}，${c.desc}`} aria-pressed={on}
          onClick={() => { onModelChange(m); setOpen(null) }}>
          <ModelRing model={m} d={22} />
          <span className={styles.mdlRowMain}>
            <span className={styles.mdlRowName}>{c.label}<RecommendationPill recommended={c.recommended} />{c.isNew && <em className={styles.mdlNew}>NEW</em>}</span>
            <small>{c.desc}</small>
          </span>
          {on && <IcCheck size={15} sw={2.6} className={styles.mdlTick} />}
        </button>
      })}
    </Overlay>}
  </div>
}
