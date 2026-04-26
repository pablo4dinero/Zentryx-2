import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress errors that originate from browser extensions (e.g. MetaMask, wallets).
// These are not app errors and should never surface in the UI overlay.
const suppressExtensionErrors = (event: ErrorEvent | PromiseRejectionEvent) => {
  const src =
    (event instanceof ErrorEvent ? event.filename : "") ||
    ((event as PromiseRejectionEvent).reason?.stack ?? "");
  if (src.includes("chrome-extension://") || src.includes("moz-extension://")) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
};
window.addEventListener("error", suppressExtensionErrors as EventListener, true);
window.addEventListener("unhandledrejection", suppressExtensionErrors as EventListener, true);

createRoot(document.getElementById("root")!).render(<App />);
