import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { activityQueryKeys } from './useActivity';

interface LiveMessage {
  type?: string;
  message?: string;
}

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function useLiveSync(): { syncMessage: string | null } {
  const queryClient = useQueryClient();
  const didReconnect = useRef(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const clearTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closedByCleanup = false;

    function connect(): void {
      const token = localStorage.getItem('devpulse_token');
      if (!token) return;

      socket = new WebSocket(wsUrl());

      socket.addEventListener('open', () => {
        socket?.send(JSON.stringify({ type: 'auth', token }));
      });

      socket.addEventListener('message', (event) => {
        let payload: LiveMessage;
        try {
          payload = JSON.parse(event.data as string) as LiveMessage;
        } catch {
          return;
        }

        if (payload.type === 'sync_progress' && payload.message) {
          setSyncMessage(payload.message);
        }

        if (payload.type === 'sync_complete') {
          queryClient.invalidateQueries({ queryKey: activityQueryKeys.all });
          if (clearTimerRef.current !== undefined) {
            window.clearTimeout(clearTimerRef.current);
          }
          clearTimerRef.current = window.setTimeout(() => setSyncMessage(null), 5000);
        }
      });

      socket.addEventListener('close', (event) => {
        if (closedByCleanup || event.code === 1000 || didReconnect.current) {
          return;
        }

        didReconnect.current = true;
        reconnectTimer = window.setTimeout(connect, 3000);
      });
    }

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      if (clearTimerRef.current !== undefined) {
        window.clearTimeout(clearTimerRef.current);
      }
      socket?.close(1000);
    };
  }, [queryClient]);

  return { syncMessage };
}
