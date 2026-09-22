import { useEffect, useState } from "react";
import { subscribeKeyboardInset, getKeyboardInset } from "@/lib/viewport-inset";

/**
 * Stable on-screen keyboard height. See src/lib/viewport-inset.ts for why the
 * raw visualViewport events are not used directly.
 *
 * @param enabled       only subscribe while the layer is on screen
 * @param respectFreeze when true, updates pause while a layer above (the client
 *                      picker) owns the keyboard, so this layer stays still
 */
export function useKeyboardInset(enabled: boolean, respectFreeze = false) {
  const [inset, setInset] = useState(() => (enabled ? getKeyboardInset() : 0));

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    return subscribeKeyboardInset(setInset, respectFreeze);
  }, [enabled, respectFreeze]);

  return inset;
}

export default useKeyboardInset;
