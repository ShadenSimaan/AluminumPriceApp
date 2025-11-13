import { useEffect, useState } from "react";

export function useKeyboardAwareInsets() {
  const [bottomPad, setBottomPad] = useState(0);

  useEffect(() => {
    const vv = (window as any).visualViewport;
    if (!vv) return;

    const onResize = () => {
      // When the keyboard opens, visualViewport.height shrinks.
      const keyboardShown = window.innerHeight - vv.height > 120;
      setBottomPad(keyboardShown ? (window.innerHeight - vv.height - vv.offsetTop) : 0);
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  return bottomPad; // px to add at bottom when keyboard is open
}
