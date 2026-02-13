import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { playNotificationSound } from "./utils/sound";

type ToastState = "loading" | "done" | "error";

interface ToastStateEventPayload {
  state: ToastState;
  message?: string;
}

function Toast() {
  const [state, setState] = useState<ToastState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;

    listen<ToastStateEventPayload>("toast-state", (event) => {
      const payload = event.payload;
      const nextState = payload?.state;

      if (nextState !== "loading" && nextState !== "done" && nextState !== "error") {
        return;
      }

      setState(nextState);

      if (nextState === "error") {
        setErrorMsg(payload?.message || "Error");
      } else {
        setErrorMsg("");
      }

      if (nextState === "done") {
        playNotificationSound();
      }
    }).then((cleanup) => {
      if (isMounted) {
        unlisten = cleanup;
      } else {
        cleanup();
      }
    });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
        {state === "loading" && (
          <>
            <svg
              className="w-4 h-4 animate-spin text-(--accent)"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-100"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-[13px] font-medium text-white/90">
              Refining...
            </span>
          </>
        )}
        {state === "done" && (
          <>
            <svg
              className="w-4 h-4 text-green-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[13px] font-medium text-white/90">
              Done!
            </span>
          </>
        )}
        {state === "error" && (
          <>
            <svg
              className="w-4 h-4 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span className="text-[13px] font-medium text-white/90">
              {errorMsg || "Error"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default Toast;
