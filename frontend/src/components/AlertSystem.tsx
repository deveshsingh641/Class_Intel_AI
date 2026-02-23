import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, ShieldAlert, TrendingDown, MessageSquareWarning, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Alert {
  id: string;
  _id: string;
  teacherId: string;
  type: "negative_spike" | "risk_alert" | "low_rating" | "topic_alert";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  createdAt: string;
}

interface AlertSystemProps {
  teacherId: string;
}

const alertIcons: Record<string, any> = {
  negative_spike: TrendingDown,
  risk_alert: ShieldAlert,
  low_rating: AlertTriangle,
  topic_alert: MessageSquareWarning,
};

const severityStyles: Record<string, string> = {
  critical: "border-red-500 bg-red-50 dark:bg-red-950/30",
  warning: "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
  info: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
};

export function AlertSystem({ teacherId }: AlertSystemProps) {
  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: [`/api/intelligence/alerts/${teacherId}`],
    refetchInterval: 30000, // Refresh every 30s
  });

  const markReadMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await apiRequest("PATCH", `/api/intelligence/alerts/${alertId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/intelligence/alerts/${teacherId}`] });
    },
  });

  const unreadCount = alerts.filter(a => !a.isRead).length;

  if (isLoading) return null;

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            AI Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4 text-sm">No alerts at this time. All clear! ✅</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" />
          AI Alerts
          {unreadCount > 0 && (
            <Badge variant="destructive" className="ml-auto">{unreadCount} new</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-80 overflow-y-auto">
        {alerts.map(alert => {
          const Icon = alertIcons[alert.type] || AlertTriangle;
          const style = severityStyles[alert.severity] || severityStyles.info;

          return (
            <div
              key={alert.id || alert._id}
              className={`p-3 rounded-lg border-l-4 ${style} ${alert.isRead ? "opacity-60" : ""} transition-opacity`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                  alert.severity === "critical" ? "text-red-600" :
                  alert.severity === "warning" ? "text-amber-600" : "text-blue-600"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{alert.title}</p>
                    <Badge variant="outline" className="text-[10px]">{alert.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
                {!alert.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => markReadMutation.mutate(alert.id || alert._id)}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
