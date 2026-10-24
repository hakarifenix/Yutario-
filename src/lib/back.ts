type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** Registers a transient back handler (dialogs, sheets, players). Top of stack wins. */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/** Runs the topmost handler. Returns true when the event was consumed. */
export function runBackHandlers(): boolean {
  const handler = handlers[handlers.length - 1];
  if (!handler) return false;
  try {
    return handler();
  } catch (error) {
    console.error('back handler failed', error);
    return false;
  }
}

export function hasBackHandlers(): boolean {
  return handlers.length > 0;
}
