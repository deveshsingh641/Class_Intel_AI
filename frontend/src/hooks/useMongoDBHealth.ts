import { useEffect, useState } from 'react';

export interface HealthStatus {
  status: 'ok' | 'error' | 'checking';
  mongodb: 'connected' | 'disconnected' | 'checking';
  error?: string;
  timestamp?: string;
  uptime?: number;
}

/**
 * Custom hook to monitor MongoDB connectivity
 * Checks health every 30 seconds in the background
 * @param enabled - Whether to enable health checking (default: true)
 * @param intervalMs - Check interval in milliseconds (default: 30000)
 */
export function useMongoDBHealth(enabled = true, intervalMs = 30000) {
  const [health, setHealth] = useState<HealthStatus>({
    status: 'checking',
    mongodb: 'checking',
  });
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(8000), // 8 second timeout
        });
        
        if (response.ok) {
          const data = await response.json();
          setHealth({
            status: data.status || 'ok',
            mongodb: data.mongodb || 'connected',
            timestamp: data.timestamp,
            uptime: data.uptime,
            error: undefined,
          });
          setConsecutiveFailures(0);
        } else {
          const data = await response.json().catch(() => ({}));
          setHealth({
            status: 'error',
            mongodb: 'disconnected',
            error: data.error || `HTTP ${response.status}`,
            timestamp: new Date().toISOString(),
          });
          setConsecutiveFailures(prev => prev + 1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setHealth({
          status: 'error',
          mongodb: 'disconnected',
          error: message,
          timestamp: new Date().toISOString(),
        });
        setConsecutiveFailures(prev => prev + 1);
      }
    };

    // Initial check
    checkHealth();

    // Set up interval
    const interval = setInterval(checkHealth, intervalMs);
    return () => clearInterval(interval);
  }, [enabled, intervalMs]);

  return {
    health,
    isConnected: health.status === 'ok' && health.mongodb === 'connected',
    isChecking: health.status === 'checking',
    hasErrors: consecutiveFailures >= 2, // Alert after 2 consecutive failures
    consecutiveFailures,
  };
}
