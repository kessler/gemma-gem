const IS_DEV = import.meta.env.DEV

const PREFIX = '[Gemma Gem]'

export const log = {
  info(...args: unknown[]) {
    if (IS_DEV) console.log(PREFIX, ...args)
  },
  warn(...args: unknown[]) {
    if (IS_DEV) console.warn(PREFIX, ...args)
  },
  error(...args: unknown[]) {
    // Always log errors
    console.error(PREFIX, ...args)
  },
  debug(...args: unknown[]) {
    if (IS_DEV) console.debug(PREFIX, ...args)
  },
}
