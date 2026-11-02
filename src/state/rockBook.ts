import { create } from 'zustand'

/** 岩石コレクション（図鑑）の画面を開いているか。sel は詳しく見ている岩 "group:id" */
export const useRockBook = create<{ open: boolean; sel: string | null }>(() => ({ open: false, sel: null }))

export const openRocks = () => {
  if (document.pointerLockElement) document.exitPointerLock()
  useRockBook.setState({ open: true, sel: null })
}
export const closeRocks = () => useRockBook.setState({ open: false, sel: null })
