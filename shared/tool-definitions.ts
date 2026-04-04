import type { ToolDefinition } from '../agent/types'

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'read_page_content',
    description: 'Read the text or HTML content of the current page or a specific element',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to target a specific element. Defaults to body.',
        },
        format: {
          type: 'string',
          description: 'Output format: "text" for plain text or "html" for raw HTML',
          enum: ['text', 'html'],
        },
      },
    },
  },
  {
    name: 'take_screenshot',
    description: 'Capture a screenshot of the currently visible page',
  },
  {
    name: 'click_element',
    description: 'Click on an element identified by a CSS selector',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text into an input element identified by a CSS selector',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element',
        },
        text: {
          type: 'string',
          description: 'The text to type into the element',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'scroll_page',
    description: 'Scroll the page up or down',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          description: 'Scroll direction',
          enum: ['up', 'down'],
        },
        amount: {
          type: 'number',
          description: 'Pixels to scroll. Defaults to 500.',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'run_javascript',
    description: 'Execute JavaScript code in the page context and return the result',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. The last expression is returned as the result.',
        },
      },
      required: ['code'],
    },
  },
]
