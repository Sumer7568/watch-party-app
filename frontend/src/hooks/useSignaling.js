import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export function useSignaling(roomCode, peerId, onEvent) {
  const afterRef = useRef(0);
  const activeRef = useRef(true);
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  const send = useCallback(
    async (type, payload) => {
      if (!roomCode || !peerId) return;
      await api.sendSignal(roomCode, peerId, type, payload);
    },
    [roomCode, peerId]
  );

  useEffect(() => {
    activeRef.current = true;
    afterRef.current = 0;

    if (!roomCode || !peerId) return undefined;

    const poll = async () => {
      if (!activeRef.current) return;
      try {
        const events = await api.pollSignals(roomCode, peerId, afterRef.current);
        for (const event of events) {
          afterRef.current = Math.max(afterRef.current, event.id);
          handlerRef.current?.(event);
        }
      } catch {
        // polling errors are ignored; next tick retries
      }
    };

    poll();
    const timer = setInterval(poll, 900);
    return () => {
      activeRef.current = false;
      clearInterval(timer);
    };
  }, [roomCode, peerId]);

  return { send };
}
