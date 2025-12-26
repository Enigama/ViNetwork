/**
 * Debounce utility to limit how often a function can be called
 * Integrated with RAF for frame-synced updates
 * @param func The function to debounce
 * @param wait The delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;

  return function(this: any, ...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      // Execute in next frame for smooth UI
      rafId = requestAnimationFrame(() => {
        func.apply(this, args);
        rafId = null;
      });
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
