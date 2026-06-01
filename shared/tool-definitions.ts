import type { ToolDefinition } from '@kessler/gemma-agent'

export const TOOL_DEFINITIONS: Omit<ToolDefinition, 'execute'>[] = [
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
    description: 'Click on an element by CSS selector. The "selector" parameter is required and must be a specific CSS selector string (e.g. "a.classname", "#id", "button[aria-label=\'X\']"). If you cannot determine a reliable selector from the page snapshot, use run_javascript instead.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'A specific CSS selector string for the element to click',
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
    name: 'select_option',
    description: 'Select an option in a select dropdown by exact option value or visible label',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the select element',
        },
        value: {
          type: 'string',
          description: 'Exact option value to select',
        },
        label: {
          type: 'string',
          description: 'Exact visible option label to select',
        },
      },
      required: ['selector'],
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
    description: 'Execute JavaScript in the page context with full DOM access. Use this to click elements when you cannot determine a reliable CSS selector: e.g. document.querySelectorAll("a")[0].click(). Also use it to inspect elements: JSON.stringify([...document.querySelectorAll("a")].slice(0,5).map(a=>({text:a.textContent.trim(),href:a.href})))',
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
