/**
 * Logger interface for the library
 */
export interface Logger {
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  setDebug(debug: boolean): void;
}

/**
 * Create a logger with a prefix
 * @param prefix - Prefix to add to all log messages
 * @returns Logger instance
 */
export function createLogger(prefix: string): Logger {
  let debug = false;

  return {
    log(...args: any[]) {
      if (debug) {
        console.log(`[${prefix}]`, ...args);
      }
    },
    warn(...args: any[]) {
      console.warn(`[${prefix}]`, ...args);
    },
    error(...args: any[]) {
      console.error(`[${prefix}]`, ...args);
    },
    setDebug(value: boolean) {
      debug = value;
    },
  };
}
