/**
 * Type-safe event emitter
 * @template Events - Event map with event names as keys and event data types as values
 *
 * @example
 * ```typescript
 * interface MyEvents {
 *   'connect': { peerId: string };
 *   'disconnect': { reason: string };
 *   'message': { data: any };
 * }
 *
 * class MyClass extends EventEmitter<MyEvents> {
 *   connect(peerId: string) {
 *     this.emit('connect', { peerId });
 *   }
 * }
 *
 * const instance = new MyClass();
 * instance.on('connect', ({ peerId }) => {
 *   console.log('Connected:', peerId);
 * });
 * ```
 */
export class EventEmitter<Events extends Record<string, any>> {
  private listeners = new Map<keyof Events, Set<Function>>();

  /**
   * Register an event listener
   * @param event - Event name
   * @param listener - Event listener function
   * @returns Unsubscribe function to remove the listener
   */
  on<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  /**
   * Unregister an event listener
   * @param event - Event name
   * @param listener - Event listener function to remove
   */
  off<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit an event to all registered listeners
   * @param event - Event name
   * @param data - Event data matching the event type
   */
  protected emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(data));
    }
  }

  /**
   * Remove all listeners for a specific event or all events
   * @param event - Optional event name. If not provided, removes all listeners.
   */
  removeAllListeners(event?: keyof Events): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
