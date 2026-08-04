import { describe, it, beforeAll } from 'vitest'
function memStorage() {
  const m = new Map<string, string>()
  return { getItem:(k:string)=>m.has(k)?m.get(k)!:null, setItem:(k:string,v:string)=>void m.set(k,v), removeItem:(k:string)=>void m.delete(k) }
}
let store: any
beforeAll(async () => { (globalThis as any).localStorage = memStorage(); store = (await import('../store/useStore')).useStore })
const get = () => store.getState()
const find = (id:string) => get().world.assets.find((a:any)=>a.id===id)
describe('repro', () => {
  it('新建角色→生成4张', () => {
    const proj = get().world.projects[0]
    const id = get().createShellAsset(proj.id, 'character', '角A').message
    console.log('CREATE referencedFrom=', find(id).referencedFrom)
    const gr = get().appendCandidates(id, [0,1,2,3].map(i=>`x?g=${i}`))
    const a = find(id)
    console.log('4AFTER msg=', gr.message, 'cover=', JSON.stringify(a.cover), 'status=', a.status, 'refImgs=', a.referenceImages)
  })
  it('造型(referencedFrom)→生成1张自动定稿', () => {
    // 取一个 demo 造型空壳（有 referencedFrom），先 analyze+generate 铺数据
    get().resetDemo(); get().runDemoAnalyze(); get().runDemoGenerate()
    const look = get().world.assets.find((a:any)=>a.referencedFrom && a.status==='empty')
    console.log('LOOK id=', look?.id, 'refFrom=', look?.referencedFrom, 'preRefImgs=', look?.referenceImages)
    const gr = get().appendCandidates(look.id, ['z?g=0'])
    const a = find(look.id)
    console.log('LOOKAFTER msg=', gr.message, 'status=', a.status, 'refImgs=', a.referenceImages)
  })
})
