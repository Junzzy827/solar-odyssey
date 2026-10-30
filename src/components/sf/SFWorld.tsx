import { CubeShip } from '../cube/CubeShip'
import { Colony } from './Colony'

/** SF モードだけに出す、架空の船や構造物（data/sf.ts の SF_OBJECTS と対になる） */
export function SFWorld() {
  return (
    <>
      <CubeShip />
      <Colony />
    </>
  )
}
