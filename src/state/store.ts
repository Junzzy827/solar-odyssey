import { create } from 'zustand'

export type Mode = 'map' | 'flight'
export type WarpPhase = 'idle' | 'charge' | 'warp' | 'exit'

type Telemetry = { distance: number | null; speed: number; eta: number | null }

type State = {
  mode: Mode
  targetId: string | null
  warpFactor: number
  warpPhase: WarpPhase
  autopilot: boolean
  timeScale: number
  telemetry: Telemetry
  setMode: (mode: Mode) => void
  setTarget: (id: string | null) => void
  setWarpFactor: (factor: number) => void
  setWarpPhase: (phase: WarpPhase) => void
  setAutopilot: (on: boolean) => void
  setTimeScale: (scale: number) => void
  setTelemetry: (t: Telemetry) => void
}

export const useStore = create<State>((set) => ({
  mode: 'map',
  targetId: null,
  warpFactor: 6,
  warpPhase: 'idle',
  autopilot: false,
  timeScale: 1,
  telemetry: { distance: null, speed: 0, eta: null },
  setMode: (mode) => set({ mode }),
  setTarget: (targetId) => set({ targetId, autopilot: false }),
  setWarpFactor: (warpFactor) => set({ warpFactor }),
  setWarpPhase: (warpPhase) => set({ warpPhase }),
  setAutopilot: (autopilot) => set({ autopilot }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setTelemetry: (telemetry) => set({ telemetry }),
}))
