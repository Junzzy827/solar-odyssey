import { Component, type ReactNode } from 'react'

/**
 * SF の構造物のどれかで描画が失敗しても、太陽系の全体まで消えないようにする。
 * （R3F では、1つの部品のエラーで画面全体の 3D が消えてしまう）
 */
export class SFBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('SF world failed to render', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
