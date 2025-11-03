import { useCallback, useEffect, useMemo, useState } from "react";

const STANDALONE_QUERY = "(display-mode: standalone)";

/**
 * Lightweight helper for handling the browser `beforeinstallprompt` flow.
 * Surfaces whether we can show an install prompt and exposes an install action.
 */
export default function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [promptAvailable, setPromptAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setPromptAvailable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const computeInstalled = () => {
      const standaloneMatch =
        typeof window.matchMedia === "function"
          ? window.matchMedia(STANDALONE_QUERY).matches
          : false;
      const navigatorStandalone =
        // Safari on iOS exposes navigator.standalone
        typeof window.navigator !== "undefined" && "standalone" in window.navigator
          ? Boolean(window.navigator.standalone)
          : false;
      setIsInstalled(standaloneMatch || navigatorStandalone);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setPromptAvailable(false);
    };

    computeInstalled();

    window.addEventListener("appinstalled", handleAppInstalled);

    if (typeof window.matchMedia === "function") {
      const mq = window.matchMedia(STANDALONE_QUERY);
      const handleChange = () => computeInstalled();
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", handleChange);
      } else if (typeof mq.addListener === "function") {
        mq.addListener(handleChange);
      }

      return () => {
        window.removeEventListener("appinstalled", handleAppInstalled);
        if (typeof mq.removeEventListener === "function") {
          mq.removeEventListener("change", handleChange);
        } else if (typeof mq.removeListener === "function") {
          mq.removeListener(handleChange);
        }
      };
    }

    return () => {
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!deferredPrompt && promptAvailable) {
      setPromptAvailable(false);
    }
  }, [deferredPrompt, promptAvailable]);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      return { outcome: "unavailable" };
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setPromptAvailable(false);
    return choice;
  }, [deferredPrompt]);

  const platform = useMemo(() => {
    if (typeof window === "undefined") {
      return "unknown";
    }
    const ua = window.navigator.userAgent || "";
    if (/android/i.test(ua)) return "android";
    if (/iphone|ipad|ipod/i.test(ua)) return "ios";
    if (/mac os x/i.test(ua)) return "mac";
    if (/windows/i.test(ua)) return "windows";
    return "unknown";
  }, []);

  const canInstall = promptAvailable && !isInstalled;

  return {
    canInstall,
    isInstalled,
    install,
    platform,
    promptAvailable,
  };
}
