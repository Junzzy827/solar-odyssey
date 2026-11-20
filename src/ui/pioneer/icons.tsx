// 開拓の画面で使う小さな絵（SVG）。色は CSS の currentColor と --pio-* に合わせる

type P = { size?: number }

/** 岩を砕く */
export const IconMine = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M5 14l3-6 6-2 5 4-1 6-6 3-5-1z" fill="var(--pio-metal)" opacity="0.85" />
    <path d="M8 8l2 4 4-1M10 12l-2 5M14 11l4 5" stroke="#1a1420" strokeWidth="1.2" fill="none" />
    <path d="M1 4l5 3" stroke="#9fd0ff" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/** 木星でガス */
export const IconGas = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="13" r="9" fill="#d9a877" />
    <path d="M3.5 10h17M3.2 14h17.6M4.5 17.5h15" stroke="#a5734c" strokeWidth="1.3" />
    <path d="M2 5c4 2 8 2 12 0s6-2 8 0" stroke="var(--pio-gas)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
)

/** 天の湊へ納める */
export const IconDock = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="8" stroke="#c9d6ee" strokeWidth="2.2" fill="none" />
    <path d="M12 4v16M4 12h16" stroke="#c9d6ee" strokeWidth="1.4" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="var(--pio-ice)" />
  </svg>
)

/** 建設する */
export const IconBuild = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <rect x="3" y="9" width="18" height="6" rx="3" fill="none" stroke="#c9d6ee" strokeWidth="2" />
    <path d="M7 9v6M11 9v6M15 9v6" stroke="#c9d6ee" strokeWidth="1.2" />
    <path d="M17 2l1.2 2.6L21 5l-2.2 1.8.6 2.8L17 8.2l-2.4 1.4.6-2.8L13 5l2.8-.4z" fill="#ffd86b" />
  </svg>
)

/** 完成 */
export const IconDone = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3 1.2-6.5L2.5 8.9 9.1 8z" fill="#ffd86b" />
  </svg>
)
