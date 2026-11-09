import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { IMAGE_MODELS, IMAGE_MODEL_IDS, lockedReason, specLine, type ImageModelId, type ImageParams, type ParamKey, type Tier } from '../../data/imageModels'
import Overlay from './Overlay'
import { useTip } from './useTip'
import { IcCheck, IcChev, IcImage, IcPhanS, IcQuality, IcSeedanceS } from './icons'
import styles from './GenSettingsBar.module.css'

interface Props {
  model: ImageModelId
  params: ImageParams
  onModelChange: (m: ImageModelId) => void
  onParamsChange: (p: ImageParams) => void
  flash?: ParamKey[]
  disabled?: boolean
}

/** 名字后头那枚身份胶囊。免费档不挂 —— 「不是会员专属」这件事不值得占一枚牌子。 */
const TierPill = ({ tier }: { tier: Tier }) => tier === 'vip' ? <em className={styles.mdlTier}>VIP</em> : null
/** 型号徽章：深色圆心 + 一圈银边，中间一枚白徽记。会员身份由名字后的金胶囊说，环只说厂牌。 */
const ModelRing = ({ model, d }: { model: ImageModelId; d: number }) => {
  const G = IMAGE_MODELS[model].vendor === 'seedream' ? IcSeedanceS : IcPhanS
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
      <ModelRing model={model} d={20} /><span className={styles.mdlName}>{cap.label}</span><TierPill tier={cap.tier} />
      <IcChev size={12} className={styles.mdlChev} />
    </button>
    <Field {...field} key={`${model}-resolution`} id="resolution" name="清晰度" value={params.resolution}
      icon={<IcQuality size={15} sw={1.9} lv={params.resolution === '1K' ? 1 : params.resolution === '2K' ? 2 : 3} />}
      reason={lockedReason(model, 'resolution')} flash={flash.includes('resolution')}
      opts={cap.resolutions.map((r) => ({ k: r, label: r, on: r === params.resolution, pick: () => onParamsChange({ ...params, resolution: r }) }))} />
    <Field {...field} key={`${model}-ratio`} id="ratio" name="比例" value={params.ratio} icon={<RatioBox ratio={params.ratio} />}
      reason={lockedReason(model, 'ratio')} flash={flash.includes('ratio')}
      opts={cap.ratios.map((r) => ({ k: r, label: r, on: r === params.ratio, glyph: <RatioBox ratio={r} />, pick: () => onParamsChange({ ...params, ratio: r }) }))} />
    <Field {...field} key={`${model}-count`} id="count" name="数量" value={`${params.count} 张`} icon={<IcImage size={15} sw={1.9} />}
      reason={lockedReason(model, 'count')} flash={flash.includes('count')}
      opts={cap.counts.map((n) => ({ k: `${n}`, label: `${n} 张`, on: n === params.count, pick: () => onParamsChange({ ...params, count: n }) }))} />
    {open === 'model' && !disabled && <Overlay anchor={modelButton} label="选择模型" className={styles.mdlDrop} onClose={() => setOpen(null)}>
      {IMAGE_MODEL_IDS.map((m) => {
        const c = IMAGE_MODELS[m], on = m === model
        return <button type="button" key={m} className={`${styles.mdlRow}${on ? ` ${styles.on}` : ''}`}
          aria-label={`${c.label}，${specLine(c)}`} aria-pressed={on}
          onClick={() => { onModelChange(m); setOpen(null) }}>
          <ModelRing model={m} d={22} />
          <span className={styles.mdlRowMain}>
            <span className={styles.mdlRowName}>{c.label}<TierPill tier={c.tier} />{c.isNew && <em className={styles.mdlNew}>NEW</em>}</span>
            <small>{specLine(c)}</small>
          </span>
          {on && <IcCheck size={15} sw={2.6} className={styles.mdlTick} />}
        </button>
      })}
    </Overlay>}
  </div>
}
