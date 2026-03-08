import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Register service worker for PWA auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("A new version of FSA is available. Update now?")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("[FSA PWA] App ready to work offline");
  },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
