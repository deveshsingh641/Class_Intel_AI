import { AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useMongoDBHealth } from '@/hooks/useMongoDBHealth';

/**
 * DatabaseStatusAlert - Shows warning if MongoDB is not responding
 * Appears automatically when database connectivity issues are detected
 */
export function DatabaseStatusAlert() {
  const { health, isConnected, hasErrors } = useMongoDBHealth(true, 30000);
  const isProd = import.meta.env.PROD;

  if (isConnected) {
    return null; // No alert if everything is fine
  }

  if (hasErrors) {
    return (
      <Alert className="fixed bottom-4 right-4 w-96 bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-700 z-50">
        <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertTitle className="text-red-800 dark:text-red-200">Database Connection Error</AlertTitle>
        <AlertDescription className="text-red-700 dark:text-red-300 text-sm mt-2">
          <div className="space-y-2">
            <p>MongoDB is not responding. This usually means:</p>
            <ul className="list-disc list-inside text-xs space-y-1">
              <li>MongoDB service crashed or stopped</li>
              <li>Port 27017 is blocked or in use</li>
              <li>Data directory permissions issue</li>
            </ul>
            <p className="mt-3 text-xs font-semibold">
              💡 {isProd ? (
                <span>Backend may be sleeping. Wait ~30s and refresh.</span>
              ) : (
                <span>
                  Run <code className="bg-red-100 dark:bg-red-900 px-1 rounded">npm run dev</code> to restart
                </span>
              )}
            </p>
            {health.error && (
              <p className="text-xs mt-1">
                <span className="font-semibold">Error:</span> {health.error}
              </p>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
