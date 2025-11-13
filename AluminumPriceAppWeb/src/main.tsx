// FILE: src/main.tsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import ErrorBoundary from "./ErrorBoundary";

// 100vh fix using --vh with visualViewport (Android/iOS safe)
function setVHVar() {
  const vv = (window as any).visualViewport;
  const h = vv?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--vh", (h / 100).toString());
}
setVHVar();
window.addEventListener("resize", setVHVar);
(window as any).visualViewport?.addEventListener("resize", setVHVar);
window.addEventListener("orientationchange", setVHVar);

// Use the same storage key here so the ErrorBoundary can clear it if needed.
const STORAGE_KEY = "aluminum-quote-app:new-mobile-style-v1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary storageKeys={[STORAGE_KEY]}>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
