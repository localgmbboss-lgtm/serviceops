import "./theme.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";
import { syncSubscriptionFromWorker } from "./lib/pushNotifications.js";

const el = document.getElementById("root");
createRoot(el).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

serviceWorkerRegistration.register({
  onSuccess: () => {
    console.log("Service worker registered.");
  },
  onError: (error) => {
    console.error("Service worker registration error:", error);
  },
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const { data } = event;
    if (!data || typeof data !== "object") return;
    if (data.type === "PUSH_SUBSCRIPTION_CHANGED" && data.subscription) {
      syncSubscriptionFromWorker(data.subscription);
    }
  });
}



