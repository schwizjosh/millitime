import { useState, useEffect, useCallback, useRef } from 'react';
import type { Signal } from '../services/api';

interface UseRealTimeSignalsOptions {
  onSignal?: (signal: Signal) => void;
  autoConnect?: boolean;
}

interface UseRealTimeSignalsReturn {
  signals: Signal[];
  connected: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  clearSignals: () => void;
}

/**
 * Custom hook for real-time signal delivery via Server-Sent Events (SSE)
 *
 * @example
 * ```tsx
 * const { signals, connected } = useRealTimeSignals({
 *   onSignal: (signal) => console.log('New signal:', signal),
 *   autoConnect: true
 * });
 * ```
 */
export function useRealTimeSignals(
  options: UseRealTimeSignalsOptions = {}
): UseRealTimeSignalsReturn {
  const { onSignal, autoConnect = true } = options;

  const [signals, setSignals] = useState<Signal[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const getApiUrl = useCallback(() => {
    const apiBaseUrl = import.meta.env.VITE_API_URL ||
      (window.location.hostname === 'localhost' ? 'http://localhost:3010' : '');
    return `${apiBaseUrl}/api/signals/stream`;
  }, []);

  const connect = useCallback(() => {
    // Don't connect if already connected
    if (eventSourceRef.current) {
      console.log('[SSE] Already connected');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.error('[SSE] No authentication token found');
      setError('Authentication required');
      return;
    }

    try {
      const url = getApiUrl();
      console.log('[SSE] Connecting to:', url);

      // Note: EventSource doesn't support custom headers in standard browsers
      // We'll append the token as a query parameter for auth
      const urlWithToken = `${url}?token=${encodeURIComponent(token)}`;

      const eventSource = new EventSource(urlWithToken);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] Connection opened');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Filter out connection/heartbeat messages
          if (data.type === 'connected') {
            console.log('[SSE] Connection confirmed:', data.message);
            return;
          }

          // Handle actual signal data
          if (data.id && data.coin_symbol && data.signal_type) {
            console.log('[SSE] New signal received:', data);

            const signal: Signal = {
              id: data.id,
              user_id: data.user_id,
              coin_id: data.coin_id,
              coin_symbol: data.coin_symbol,
              signal_type: data.signal_type,
              price: data.price,
              strength: data.strength,
              indicators: data.indicators || {},
              message: data.message,
              is_read: false,
              created_at: data.created_at,
              position: data.position,
              leverage: data.leverage,
              entry_price: data.entry_price,
              stop_loss: data.stop_loss,
              take_profit: data.take_profit,
              risk_reward_ratio: data.risk_reward_ratio,
            };

            // Add signal to the list (prepend to show newest first)
            setSignals((prev) => [signal, ...prev]);

            // Call the callback if provided
            if (onSignal) {
              onSignal(signal);
            }

            // Browser notification (if permitted)
            if (Notification.permission === 'granted') {
              new Notification(`${signal.signal_type} ${signal.coin_symbol.toUpperCase()}`, {
                body: signal.message,
                icon: '/favicon.ico',
                tag: `signal-${signal.id}`, // Prevent duplicate notifications
              });
            }

            // Optional: Play notification sound
            playNotificationSound();
          }
        } catch (error) {
          console.error('[SSE] Failed to parse message:', error);
        }
      };

      eventSource.onerror = (err) => {
        console.error('[SSE] Connection error:', err);
        setConnected(false);
        setError('Connection error - reconnecting...');

        // Clean up current connection
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnection with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      setError('Failed to connect');
      setConnected(false);
    }
  }, [getApiUrl, onSignal]);

  const disconnect = useCallback(() => {
    console.log('[SSE] Disconnecting...');

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnected(false);
    setError(null);
    reconnectAttemptsRef.current = 0;
  }, []);

  const clearSignals = useCallback(() => {
    setSignals([]);
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      // Request notification permission on first load
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          console.log('[Notifications] Permission:', permission);
        });
      }

      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Reconnect when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoConnect && !eventSourceRef.current) {
        console.log('[SSE] Tab visible - reconnecting...');
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoConnect, connect]);

  return {
    signals,
    connected,
    error,
    connect,
    disconnect,
    clearSignals,
  };
}

/**
 * Play a subtle notification sound
 * Uses Web Audio API to generate a tone
 */
function playNotificationSound() {
  try {
    // Check if sound is enabled
    const soundEnabled = localStorage.getItem('notificationSoundEnabled') !== 'false';
    if (!soundEnabled) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    // Silently fail if audio API not available
    console.debug('[Audio] Failed to play notification sound:', error);
  }
}
