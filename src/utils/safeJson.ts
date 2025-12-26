/**
 * Safely stringify any value, handling circular references
 * Shows [Circular] marker instead of throwing
 */
export function safeStringify(value: unknown, indent?: number): string {
  const seen = new WeakSet();
  
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === 'object') {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }
    return val;
  }, indent);
}

