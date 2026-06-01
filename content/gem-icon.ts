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
const ACTIVITY_STYLE_ID = 'gemma-gem-icon-activity-styles'

export type GemRelayActivityState = 'idle' | 'running' | 'attention' | 'error'

function ensureActivityStyles(): void {
  if (document.getElementById(ACTIVITY_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = ACTIVITY_STYLE_ID
  style.textContent = `
    #gemma-gem-icon .gemma-relay-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid rgba(9, 12, 18, 0.95);
      background: #64748b;
      opacity: 0;
      transform: scale(0.72);
      transition: opacity 160ms ease, transform 160ms ease, background 160ms ease;
      z-index: 3;
      pointer-events: none;
    }

    #gemma-gem-icon .gemma-relay-orbit {
      position: absolute;
      inset: -5px;
      border-radius: 50%;
      border: 1px solid rgba(45, 212, 191, 0);
      opacity: 0;
      pointer-events: none;
    }

    #gemma-gem-icon[data-relay-state="running"] .gemma-relay-badge {
      opacity: 1;
      transform: scale(1);
      background: #2dd4bf;
      box-shadow: 0 0 14px rgba(45, 212, 191, 0.85);
    }

    #gemma-gem-icon[data-relay-state="running"] .gemma-relay-orbit {
      opacity: 1;
      border-color: rgba(45, 212, 191, 0.7);
      animation: gemma-relay-orbit 1.15s linear infinite;
    }

    #gemma-gem-icon[data-relay-state="attention"] .gemma-relay-badge {
      opacity: 1;
      transform: scale(1);
      background: #f59e0b;
      box-shadow: 0 0 14px rgba(245, 158, 11, 0.8);
    }

    #gemma-gem-icon[data-relay-state="error"] .gemma-relay-badge {
      opacity: 1;
      transform: scale(1);
      background: #fb7185;
      box-shadow: 0 0 14px rgba(251, 113, 133, 0.8);
    }

    @keyframes gemma-relay-orbit {
      from { transform: rotate(0deg) scale(0.98); border-top-color: rgba(45, 212, 191, 0.95); }
      to { transform: rotate(360deg) scale(0.98); border-top-color: rgba(45, 212, 191, 0.95); }
    }
  `
  document.documentElement.appendChild(style)
}

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

export function createGemIcon(onClick: () => void): HTMLElement {
  ensureActivityStyles()
  const container = document.createElement('div')
  container.id = 'gemma-gem-icon'
  container.title = 'Gemma Gem'
  container.dataset.relayState = 'idle'

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
  })

  // Gem SVG centered
  const gemWrapper = document.createElement('div')
  gemWrapper.innerHTML = GEM_SVG
  Object.assign(gemWrapper.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: '1',
  })
  container.appendChild(gemWrapper)

  // Progress ring overlay
  const progressRing = createProgressRing()
  container.appendChild(progressRing)

  const relayOrbit = document.createElement('div')
  relayOrbit.className = 'gemma-relay-orbit'
  container.appendChild(relayOrbit)

  const relayBadge = document.createElement('div')
  relayBadge.className = 'gemma-relay-badge'
  container.appendChild(relayBadge)

  container.addEventListener('mouseenter', () => {
    container.style.transform = 'scale(1.1)'
    container.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.5)'
  })

  container.addEventListener('mouseleave', () => {
    container.style.transform = 'scale(1)'
    container.style.boxShadow = '0 2px 12px rgba(139, 92, 246, 0.3)'
  })

  container.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })

  return container
}

export function setGemDisabled(disabled: boolean): void {
  const container = document.getElementById('gemma-gem-icon')
  if (!container) return
  container.dataset.gemDisabled = disabled ? 'true' : 'false'

  const gemWrapper = container.querySelector('div')
  if (gemWrapper) {
    gemWrapper.innerHTML = disabled ? GEM_DISABLED_SVG : GEM_SVG
  }

  const relayTitle = container.dataset.relayTitle
  container.title = disabled
    ? 'Gemma Gem (disabled on this site)'
    : relayTitle
      ? `Gemma Gem - Relay: ${relayTitle}`
      : 'Gemma Gem'
  container.style.boxShadow = disabled
    ? '0 2px 12px rgba(100, 116, 139, 0.2)'
    : '0 2px 12px rgba(139, 92, 246, 0.3)'
}

export function setGemRelayActivity(state: GemRelayActivityState, title?: string): void {
  const container = document.getElementById('gemma-gem-icon')
  if (!container) return

  container.dataset.relayState = state
  if (title) {
    container.dataset.relayTitle = title
  } else if (state === 'idle') {
    delete container.dataset.relayTitle
  }

  const relayTitle = container.dataset.relayTitle
  const disabled = container.dataset.gemDisabled === 'true'
  container.title = disabled
    ? 'Gemma Gem (disabled on this site)'
    : state === 'idle'
      ? 'Gemma Gem'
      : `Gemma Gem - Relay: ${relayTitle ?? state}`
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
