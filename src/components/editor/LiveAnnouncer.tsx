"use client";

import { useState, useCallback } from "react";

/**
 * ARIA live region that announces drag-and-drop events to screen readers.
 * The TierListEditor calls `announce()` to push messages.
 */
export function useLiveAnnouncer() {
  const [message, setMessage] = useState("");

  const announce = useCallback((msg: string) => {
    setMessage(msg);
    // Clear after a short delay so repeated identical messages still get announced
    setTimeout(() => setMessage(""), 100);
  }, []);

  return { message, announce };
}

interface LiveAnnouncerProps {
  message: string;
}

export default function LiveAnnouncer({ message }: LiveAnnouncerProps) {
  return (
    <div
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
