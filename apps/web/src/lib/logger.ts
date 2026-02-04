/**
 * Environment-aware logger utility
 * Only logs in development mode to keep production console clean
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args); // Always show warnings
  },
  error: (...args: unknown[]) => {
    console.error(...args); // Always show errors
  },
};

export default logger;
