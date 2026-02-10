import { useEffect, useRef } from 'react';

type WindowEventHandler<K extends keyof WindowEventMap> = (event: WindowEventMap[K]) => void;

const windowHandlers = new Map<string, Set<(event: Event) => void>>();
const windowListeners = new Map<string, (event: Event) => void>();

function addWindowListener(type: string, handler: (event: Event) => void) {
  if (typeof window === 'undefined') return () => {};

  let handlers = windowHandlers.get(type);
  if (!handlers) {
    handlers = new Set();
    windowHandlers.set(type, handlers);

    const listener = (event: Event) => {
      const activeHandlers = windowHandlers.get(type);
      if (!activeHandlers) return;
      activeHandlers.forEach((fn) => fn(event));
    };

    windowListeners.set(type, listener);
    window.addEventListener(type, listener);
  }

  handlers.add(handler);

  return () => {
    const activeHandlers = windowHandlers.get(type);
    if (!activeHandlers) return;
    activeHandlers.delete(handler);
    if (activeHandlers.size === 0) {
      const listener = windowListeners.get(type);
      if (listener) {
        window.removeEventListener(type, listener);
      }
      windowListeners.delete(type);
      windowHandlers.delete(type);
    }
  };
}

export function useWindowEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: WindowEventHandler<K>,
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options ?? {};
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const stableHandler = (event: Event) => {
      handlerRef.current(event as WindowEventMap[K]);
    };

    return addWindowListener(type, stableHandler);
  }, [type, enabled]);
}