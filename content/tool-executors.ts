import type { ToolCall, ToolResponse } from '../agent/types'

const MAX_CONTENT_LENGTH = 8000

function readPageContent(args: Record<string, unknown>): ToolResponse {
  const selector = (args.selector as string) || 'body'
  const format = (args.format as string) || 'text'

  const element = document.querySelector(selector)
  if (!element) {
    return { name: 'read_page_content', result: { error: `No element found for selector: ${selector}` } }
  }

  let content = format === 'html' ? element.innerHTML : element.innerText
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH) + '\n...(truncated)'
  }

  return { name: 'read_page_content', result: { content } }
}

function clickElement(args: Record<string, unknown>): ToolResponse {
  const selector = args.selector as string
  const element = document.querySelector(selector) as HTMLElement | null
  if (!element) {
    return { name: 'click_element', result: { error: `No element found for selector: ${selector}` } }
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

function scrollPage(args: Record<string, unknown>): ToolResponse {
  const direction = args.direction as string
  const amount = (args.amount as number) || 500
  const pixels = direction === 'up' ? -amount : amount

  window.scrollBy({ top: pixels, behavior: 'smooth' })

  return { name: 'scroll_page', result: { scrolled: `${direction} ${amount}px` } }
}

export function executeContentTool(call: ToolCall): ToolResponse | null {
  switch (call.name) {
    case 'read_page_content': return readPageContent(call.arguments)
    case 'click_element': return clickElement(call.arguments)
    case 'type_text': return typeText(call.arguments)
    case 'scroll_page': return scrollPage(call.arguments)
    default: return null
  }
}
