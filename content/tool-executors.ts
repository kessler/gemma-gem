import type { ToolCall, ToolResponse } from '@kessler/gemma-agent'

const MAX_CONTENT_LENGTH = 64000

function readPageContent(args: Record<string, unknown>): ToolResponse {
  const selector = (args.selector as string) || 'body'
  const format = (args.format as string) || 'text'

  const element = document.querySelector(selector)
  if (!element) {
    return { name: 'read_page_content', result: { error: `No element found for selector: ${selector}` } }
  }

  let content = format === 'html' ? element.innerHTML : (element as HTMLElement).innerText
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH) + '\n...(truncated)'
  }

  return { name: 'read_page_content', result: { content } }
}

function clickElement(args: Record<string, unknown>): ToolResponse {
  const selector = (args.selector ?? args.body ?? args.element) as string
  if (!selector) {
    return { name: 'click_element', result: { error: 'selector parameter is required. If you cannot determine a CSS selector, use run_javascript instead: document.querySelector("a").click()' } }
  }
  const element = document.querySelector(selector) as HTMLElement | null
  if (!element) {
    return { name: 'click_element', result: { error: `No element found for selector: ${selector}. Try run_javascript to inspect available elements: JSON.stringify([...document.querySelectorAll("a")].slice(0,5).map(a=>a.href))` } }
  }

  element.click()
  const tag = element.tagName.toLowerCase()
  const text = element.textContent?.slice(0, 50) || ''
  return { name: 'click_element', result: { clicked: `${tag}: ${text}` } }
}

function typeText(args: Record<string, unknown>): ToolResponse {
  const selector = args.selector as string
  const text = args.text as string
  const element = document.querySelector(selector) as HTMLInputElement | null
  if (!element) {
    return { name: 'type_text', result: { error: `No element found for selector: ${selector}` } }
  }

  element.focus()
  element.value = text
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))

  return { name: 'type_text', result: { typed: text, into: selector } }
}

function selectOption(args: Record<string, unknown>): ToolResponse {
  const selector = args.selector as string
  const value = args.value as string | undefined
  const label = args.label as string | undefined
  const element = document.querySelector(selector) as HTMLSelectElement | null
  if (!element) {
    return { name: 'select_option', result: { error: `No select element found for selector: ${selector}` } }
  }

  const option = [...element.options].find(item =>
    (value != null && item.value === value) ||
    (label != null && item.textContent?.trim() === label) ||
    (label != null && item.textContent?.trim().toLowerCase() === label.toLowerCase())
  )
  if (!option) {
    return {
      name: 'select_option',
      result: {
        error: `No option found for selector: ${selector}`,
        available: [...element.options].map(item => ({ value: item.value, label: item.textContent?.trim() })).slice(0, 200),
      },
    }
  }

  element.value = option.value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))

  return { name: 'select_option', result: { selected: option.textContent?.trim(), value: option.value, selector } }
}

function scrollPage(args: Record<string, unknown>): ToolResponse {
  const direction = args.direction as string
  const amount = (args.amount as number) || 500
  const pixels = direction === 'up' ? -amount : amount

  window.scrollBy({ top: pixels, behavior: 'smooth' })

  return { name: 'scroll_page', result: { scrolled: `${direction} ${amount}px` } }
}

export function executeContentTool(call: ToolCall): ToolResponse | null {
  try {
    switch (call.name) {
      case 'read_page_content': return readPageContent(call.arguments)
      case 'click_element': return clickElement(call.arguments)
      case 'type_text': return typeText(call.arguments)
      case 'select_option': return selectOption(call.arguments)
      case 'scroll_page': return scrollPage(call.arguments)
      default: return null
    }
  } catch (e) {
    return { name: call.name, result: { error: `Tool ${call.name} failed: ${e instanceof Error ? e.message : e}` } }
  }
}
