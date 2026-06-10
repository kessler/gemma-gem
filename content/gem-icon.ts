const GEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="28" height="28">
  <defs>
    <linearGradient id="gem-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a855f7"/>
      <stop offset="50%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#3b82f6"/>
    </linearGradient>
  </defs>
  <polygon points="24,4 38,16 10,16" fill="#c084fc" opacity="0.9"/>
  <polygon points="10,16 24,44 4,20" fill="#818cf8" opacity="0.85"/>
  <polygon points="38,16 24,44 44,20" fill="#7c3aed" opacity="0.85"/>
  <polygon points="10,16 38,16 24,44" fill="url(#gem-grad)" opacity="0.95"/>
  <polygon points="20,10 28,10 24,18" fill="white" opacity="0.3"/>
</svg>`

const GEM_DISABLED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="28" height="28">
  <polygon points="24,4 38,16 10,16" fill="#64748b" opacity="0.5"/>
  <polygon points="10,16 24,44 4,20" fill="#475569" opacity="0.5"/>
  <polygon points="38,16 24,44 44,20" fill="#475569" opacity="0.5"/>
  <polygon points="10,16 38,16 24,44" fill="#334155" opacity="0.6"/>
  <polygon points="20,10 28,10 24,18" fill="white" opacity="0.15"/>
  <line x1="8" y1="8" x2="40" y2="40" stroke="#ef4444" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
</svg>`

const PROGRESS_SIZE = 36
const PROGRESS_RADIUS = 14
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS

function createProgressRing(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${PROGRESS_SIZE} ${PROGRESS_SIZE}`)
  svg.setAttribute('width', String(PROGRESS_SIZE))
  svg.setAttribute('height', String(PROGRESS_SIZE))
  Object.assign(svg.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    transform: 'rotate(-90deg)',
    pointerEvents: 'none',
  })

  // Background track
  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  bgCircle.setAttribute('cx', String(PROGRESS_SIZE / 2))
  bgCircle.setAttribute('cy', String(PROGRESS_SIZE / 2))
  bgCircle.setAttribute('r', String(PROGRESS_RADIUS))
  bgCircle.setAttribute('fill', 'none')
  bgCircle.setAttribute('stroke', 'rgba(139, 92, 246, 0.15)')
  bgCircle.setAttribute('stroke-width', '3')
  svg.appendChild(bgCircle)

  // Progress arc
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  circle.setAttribute('cx', String(PROGRESS_SIZE / 2))
  circle.setAttribute('cy', String(PROGRESS_SIZE / 2))
  circle.setAttribute('r', String(PROGRESS_RADIUS))
  circle.setAttribute('fill', 'none')
  circle.setAttribute('stroke', '#a855f7')
  circle.setAttribute('stroke-width', '3')
  circle.setAttribute('stroke-linecap', 'round')
  circle.setAttribute('stroke-dasharray', String(PROGRESS_CIRCUMFERENCE))
  circle.setAttribute('stroke-dashoffset', String(PROGRESS_CIRCUMFERENCE))
  circle.style.transition = 'stroke-dashoffset 0.3s ease'
  circle.id = 'gem-progress-arc'
  svg.appendChild(circle)

  return svg
}

export interface IconPosition {
  /** Distance from the left edge of the viewport, in px. */
  left: number
  /** Distance from the top edge of the viewport, in px. */
  top: number
}

export interface GemIconOptions {
  onClick: () => void
  /** Called with the new position after the user finishes dragging the icon. */
  onMove?: (pos: IconPosition) => void
  /** Called continuously with the live position while the icon is being dragged. */
  onDrag?: (pos: IconPosition) => void
  /** Restore a previously-saved position. Falls back to the bottom-right corner. */
  initialPosition?: IconPosition | null
}

/** Width/height of the icon's hit area, in px. */
export const GEM_ICON_SIZE = PROGRESS_SIZE

/** Keep a position fully inside the current viewport. */
function clampToViewport(left: number, top: number): IconPosition {
  const maxLeft = Math.max(0, window.innerWidth - PROGRESS_SIZE)
  const maxTop = Math.max(0, window.innerHeight - PROGRESS_SIZE)
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  }
}

export function createGemIcon(options: GemIconOptions): HTMLElement {
  const { onClick, onMove, onDrag, initialPosition } = options

  const container = document.createElement('div')
  container.id = 'gemma-gem-icon'
  container.title = 'Gemma Gem — drag to move'

  Object.assign(container.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: `${PROGRESS_SIZE}px`,
    height: `${PROGRESS_SIZE}px`,
    cursor: 'pointer',
    zIndex: '2147483646',
    borderRadius: '50%',
    background: 'rgba(15, 15, 25, 0.85)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 12px rgba(139, 92, 246, 0.3)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'none',
  })

  // Apply a saved position (switch from bottom/right anchoring to top/left).
  if (initialPosition) {
    const { left, top } = clampToViewport(initialPosition.left, initialPosition.top)
    container.style.left = `${left}px`
    container.style.top = `${top}px`
    container.style.right = 'auto'
    container.style.bottom = 'auto'
  }

  // Gem SVG centered
  const gemWrapper = document.createElement('div')
  gemWrapper.innerHTML = GEM_SVG
  Object.assign(gemWrapper.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: '1',
    pointerEvents: 'none',
  })
  container.appendChild(gemWrapper)

  // Progress ring overlay
  const progressRing = createProgressRing()
  container.appendChild(progressRing)

  container.addEventListener('mouseenter', () => {
    container.style.transform = 'scale(1.1)'
    container.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.5)'
  })

  container.addEventListener('mouseleave', () => {
    container.style.transform = 'scale(1)'
    container.style.boxShadow = '0 2px 12px rgba(139, 92, 246, 0.3)'
  })

  // ---- Drag handling -------------------------------------------------------
  // A press that moves more than DRAG_THRESHOLD px becomes a drag; otherwise it
  // is treated as a click. `suppressClick` stops the trailing click event from
  // toggling the chat after a drag.
  const DRAG_THRESHOLD = 4
  let pointerDown = false
  let dragging = false
  let suppressClick = false
  let startX = 0
  let startY = 0
  let grabOffsetX = 0
  let grabOffsetY = 0

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return

    dragging = true
    container.style.transition = 'none'
    const { left, top } = clampToViewport(e.clientX - grabOffsetX, e.clientY - grabOffsetY)
    container.style.left = `${left}px`
    container.style.top = `${top}px`
    container.style.right = 'auto'
    container.style.bottom = 'auto'
    onDrag?.({ left, top })
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDown) return
    pointerDown = false
    document.removeEventListener('pointermove', onPointerMove, true)
    document.removeEventListener('pointerup', onPointerUp, true)
    container.style.transition = 'transform 0.2s, box-shadow 0.2s'

    if (dragging) {
      dragging = false
      suppressClick = true
      const { left, top } = clampToViewport(e.clientX - grabOffsetX, e.clientY - grabOffsetY)
      onMove?.({ left, top })
    }
  }

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    pointerDown = true
    dragging = false
    suppressClick = false
    startX = e.clientX
    startY = e.clientY
    const rect = container.getBoundingClientRect()
    grabOffsetX = e.clientX - rect.left
    grabOffsetY = e.clientY - rect.top
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', onPointerUp, true)
  })

  container.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onClick()
  })

  return container
}

/** Show or hide the gem icon (used for the per-session hide). */
export function setGemHidden(hidden: boolean): void {
  const container = document.getElementById('gemma-gem-icon')
  if (container) container.style.display = hidden ? 'none' : 'flex'
}

/** Current top-left of the icon in the viewport, or null if it isn't mounted. */
export function getGemIconPosition(): IconPosition | null {
  const container = document.getElementById('gemma-gem-icon')
  if (!container) return null
  const rect = container.getBoundingClientRect()
  return { left: rect.left, top: rect.top }
}

/** Nudge the icon by a delta, clamped to the viewport. Returns the new position. */
export function moveGemIconBy(dx: number, dy: number): IconPosition | null {
  const container = document.getElementById('gemma-gem-icon')
  if (!container) return null
  const rect = container.getBoundingClientRect()
  const pos = clampToViewport(rect.left + dx, rect.top + dy)
  container.style.left = `${pos.left}px`
  container.style.top = `${pos.top}px`
  container.style.right = 'auto'
  container.style.bottom = 'auto'
  return pos
}

export function setGemDisabled(disabled: boolean): void {
  const container = document.getElementById('gemma-gem-icon')
  if (!container) return

  const gemWrapper = container.querySelector('div')
  if (gemWrapper) {
    gemWrapper.innerHTML = disabled ? GEM_DISABLED_SVG : GEM_SVG
  }

  container.title = disabled ? 'Gemma Gem (disabled on this site)' : 'Gemma Gem'
  container.style.boxShadow = disabled
    ? '0 2px 12px rgba(100, 116, 139, 0.2)'
    : '0 2px 12px rgba(139, 92, 246, 0.3)'
}

/** Update progress ring: 0-100, or -1 to hide */
export function updateGemProgress(progress: number): void {
  const arc = document.getElementById('gemma-gem-icon')?.querySelector('#gem-progress-arc') as SVGCircleElement | null
  if (!arc) return

  const svg = arc.parentElement as SVGSVGElement | null

  if (progress < 0 || progress >= 100) {
    if (svg) svg.style.opacity = '0'
    return
  }

  if (svg) svg.style.opacity = '1'
  const offset = PROGRESS_CIRCUMFERENCE - (progress / 100) * PROGRESS_CIRCUMFERENCE
  arc.setAttribute('stroke-dashoffset', String(offset))
}
