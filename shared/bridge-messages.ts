import type { ChatSettings } from './messages'

export type BridgeToolName =
  | 'read_page_content'
  | 'take_screenshot'
  | 'click_element'
  | 'type_text'
  | 'select_option'
  | 'scroll_page'
  | 'run_javascript'

export type ObservedAction = {
  description: string
  method: 'click' | 'type' | 'scroll' | 'select' | 'navigate' | 'wait'
  arguments: unknown[]
  selector?: string
  ref?: string
  confidence?: number
}

export type BridgeRequest =
  | { type: 'bridge:list_tabs'; requestId: string }
  | { type: 'bridge:get_active_tab'; requestId: string }
  | {
      type: 'bridge:run_agent'
      requestId: string
      tabId?: number
      prompt: string
      settings?: ChatSettings
    }
  | {
      type: 'bridge:execute_tool'
      requestId: string
      tabId?: number
      name: BridgeToolName
      arguments: Record<string, unknown>
    }
  | { type: 'bridge:stop'; requestId: string; runId?: string }

export type BridgeEvent =
  | { type: 'bridge:response'; requestId: string; result?: unknown; error?: string }
  | { type: 'bridge:chunk'; requestId: string; text: string }
  | { type: 'bridge:tool_call'; requestId: string; name: string; arguments: Record<string, unknown> }
