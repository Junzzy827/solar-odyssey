import { create } from 'zustand'

export type Mode = 'map' | 'flight'
export type CameraMode = 'chase' | 'hero'
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
  /** クイズに正解した天体 */
  visited: string[]
  logOpen: boolean
  cameraMode: CameraMode
  toast: { id: number; text: string } | null
  setMode: (mode: Mode) => void
  setTarget: (id: string | null) => void
  setWarpFactor: (factor: number) => void
  setWarpPhase: (phase: WarpPhase) => void
  setAutopilot: (on: boolean) => void
  setTimeScale: (scale: number) => void
  setTelemetry: (t: Telemetry) => void
  markVisited: (id: string) => void
  setLogOpen: (open: boolean) => void
  setCameraMode: (mode: CameraMode) => void
  showToast: (text: string) => void
}

const VISITED_KEY = 'solar-voyager:visited'

function loadVisited(): string[] {
  try {
    return JSON.parse(localStorage.getItem(VISITED_KEY) ?? '[]')
  } catch {
    return []
  }
}

export const useStore = create<State>((set) => ({
  mode: 'map',
  targetId: null,
  warpFactor: 6,
  warpPhase: 'idle',
  autopilot: false,
  timeScale: 1,
  telemetry: { distance: null, speed: 0, eta: null },
  visited: loadVisited(),
  logOpen: false,
  cameraMode: 'chase',
  toast: null,
  setMode: (mode) => set({ mode }),
  setTarget: (targetId) => set({ targetId, autopilot: false, logOpen: false }),
  setWarpFactor: (warpFactor) => set({ warpFactor }),
  setWarpPhase: (warpPhase) => set({ warpPhase }),
  setAutopilot: (autopilot) => set({ autopilot }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setTelemetry: (telemetry) => set({ telemetry }),
  markVisited: (id) =>
    set((s) => {
      if (s.visited.includes(id)) return s
      const visited = [...s.visited, id]
      try {
        localStorage.setItem(VISITED_KEY, JSON.stringify(visited))
      } catch {
        // 保存できなくても遊べる
      }
      return { visited }
    }),
  setLogOpen: (logOpen) => set({ logOpen }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
}))
