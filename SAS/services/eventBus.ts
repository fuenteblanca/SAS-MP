// Simple in-app event bus (no external deps)
type Callback = (payload?: any) => void;
const listeners: Record<string, Callback[]> = {};

export function on(event: string, cb: Callback) {
  listeners[event] = listeners[event] || [];
  listeners[event].push(cb);
  return () => off(event, cb);
}

export function off(event: string, cb: Callback) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== cb);
}

export function emit(event: string, payload?: any) {
  (listeners[event] || []).forEach(cb => {
    try { cb(payload); } catch (e) { /* ignore */ }
  });
}

export default { on, off, emit };
