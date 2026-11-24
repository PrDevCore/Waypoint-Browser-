import { useEffect } from "react";
import { getAuthToken } from "./mobile-api";

export type ChatSocketMessage =
  | { type: "chat:new"; message: { id: string; senderName: string; text: string; timestamp: number; vpnNode: string } }
  | { type: "presence"; online: string[] };

export function useChatSocket(userId: string | null, onMessage: (msg: ChatSocketMessage) => void) {
  useEffect(() => {
    if (!userId) return;
    const apiBase = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
    const wsUrl = apiBase
      ? new URL("/ws", apiBase.replace(/^http/, "ws")).toString()
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
    const token = getAuthToken();
    const ws = token
      ? new WebSocket(wsUrl, [`waypoint-bearer.${token}`])
      : new WebSocket(wsUrl);
    ws.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ChatSocketMessage;
        if (data.type === "chat:new" || data.type === "presence") onMessage(data);
      } catch {
        // Ignore malformed messages
      }
    };
    return () => {
      ws.close();
    };
  }, [userId, onMessage]);
}