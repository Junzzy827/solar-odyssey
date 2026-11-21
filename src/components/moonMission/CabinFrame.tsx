import { useMoonMission } from '../../state/moonMission'
import './cabinFrame.css'

/** 司令船の窓の枠（宇宙に出てからの「船長の窓」）。着陸船の窓は LunarHud の WindowFrame */
export function CabinFrame() {
  const cam = useMoonMission((s) => s.cam)
  const phase = useMoonMission((s) => s.phase)
  const on = cam === 'window' && (phase === 'orbit' || phase === 'tli' || phase === 'outbound' || phase === 'coast' || phase === 'loi')
  if (!on) return null
  return (
    <div className="cabin-frame" aria-hidden="true">
      <div className="cabin-glass" />
      <div className="cabin-bolt a" />
      <div className="cabin-bolt b" />
      <div className="cabin-bolt c" />
      <div className="cabin-bolt d" />
    </div>
  )
}
