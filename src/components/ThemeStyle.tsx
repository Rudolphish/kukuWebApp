'use client'

import { useApp } from './AppProvider'

/** テーマの色を CSS 変数として流し込む。着せ替えを CSS 側だけで完結させる。 */
export default function ThemeStyle() {
  const { theme } = useApp()
  const { colors } = theme
  const css = `:root{--bg:${colors.bg};--panel:${colors.panel};--line:${colors.line};--text:${colors.text};--accent:${colors.accent};--accent2:${colors.accent2};--danger:${colors.danger};}`
  return <style>{css}</style>
}
