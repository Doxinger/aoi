const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
}

export function emit(event, payload) {
  const handlers = listeners.get(event);
  if (handlers) handlers.forEach(handler => handler(payload));
}
