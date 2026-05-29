// A keyboard shortcut is keyed off KeyboardEvent.code (the physical key, e.g.
// 'KeyG'), not .key — because holding a modifier like Alt mutates .key into a
// layout-dependent character (on macOS, Alt+G yields '©'), whereas .code is stable.
export interface Shortcut {
  code: string
  alt: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
}

export interface ShortcutsConfig {
  toggle: Shortcut
  close: Shortcut
}

export const DEFAULT_SHORTCUTS: ShortcutsConfig = {
  toggle: { code: 'KeyG', alt: true, ctrl: false, meta: false, shift: false },
  close: { code: 'Escape', alt: false, ctrl: false, meta: false, shift: false },
}

export const STORAGE_KEY_SHORTCUTS = 'gemma_shortcuts'

const MODIFIER_CODES = new Set([
  'AltLeft', 'AltRight',
  'ControlLeft', 'ControlRight',
  'MetaLeft', 'MetaRight',
  'ShiftLeft', 'ShiftRight',
])

export function matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
  return e.code === shortcut.code &&
    e.altKey === shortcut.alt &&
    e.ctrlKey === shortcut.ctrl &&
    e.metaKey === shortcut.meta &&
    e.shiftKey === shortcut.shift
}

// Build a Shortcut from a keydown event, or null when only a modifier was pressed
// (so the rebind UI keeps waiting for a real key).
export function shortcutFromEvent(e: KeyboardEvent): Shortcut | null {
  if (MODIFIER_CODES.has(e.code)) return null
  return {
    code: e.code,
    alt: e.altKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    shift: e.shiftKey,
  }
}

function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  if (code.startsWith('Arrow')) return code.slice(5)
  return code
}

export function formatShortcut(shortcut: Shortcut): string {
  const parts: string[] = []
  if (shortcut.ctrl) parts.push('Ctrl')
  if (shortcut.alt) parts.push('Alt')
  if (shortcut.shift) parts.push('Shift')
  if (shortcut.meta) parts.push('Cmd')
  parts.push(codeLabel(shortcut.code))
  return parts.join('+')
}
