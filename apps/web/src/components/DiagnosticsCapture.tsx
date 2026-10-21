"use client";

import { useEffect } from "react";
import { setRecording } from "@/lib/diagnosticsClient";

/**
 * Starts (or stops) local error recording.
 *
 * Mounted once in the root layout. It renders nothing. Recording only ever
 * happens on the device - nothing is sent anywhere until the user opens
 * Diagnostics and presses Send.
 */
export default function DiagnosticsCapture({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    setRecording(enabled);
    return () => {
      if (enabled) setRecording(false);
    };
  }, [enabled]);

  return null;
}
