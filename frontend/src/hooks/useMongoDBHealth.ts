import { useEffect, useState } from 'react';
import { withApiBase } from '@/lib/queryClient';

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

    // Render free-tier services can take 10–30s to wake up on the first request.
    // Use a longer timeout in production builds so we don't show false "MongoDB down" alerts.
    const timeoutMs = import.meta.env.PROD ? 25000 : 8000;

    const checkHealth = async () => {
      try {
        const url = withApiBase('/api/health');
        const response = await fetch(url, { 
          method: 'GET',
          signal: AbortSignal.timeout(timeoutMs),
          credentials: 'include',
        });

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.toLowerCase().includes('application/json');
        
        if (response.ok) {
          if (!isJson) {
            const bodyPreview = (await response.text()).slice(0, 200);
            throw new Error(
              `Health check returned non-JSON from ${url}. This usually means the frontend is hitting the wrong host (missing VITE_API_URL on Vercel). Response starts with: ${JSON.stringify(bodyPreview)}`,
            );
          }

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
          const data = isJson ? await response.json().catch(() => ({})) : {};
          const fallbackText = !isJson ? (await response.text()).slice(0, 200) : undefined;
          setHealth({
            status: 'error',
            mongodb: 'disconnected',
            error:
              data.error ||
              data.message ||
              (fallbackText ? `HTTP ${response.status}: ${fallbackText}` : `HTTP ${response.status}`),
            timestamp: new Date().toISOString(),
          });
          setConsecutiveFailures(prev => prev + 1);
        }
      } catch (error) {
        const message =
          error && typeof error === 'object' && (error as any).name === 'AbortError'
            ? `Timed out contacting the backend. If you're using Render free tier, wait ~30s for it to wake up and refresh.`
            : error instanceof Error
              ? error.message
              : 'Unknown error';
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
