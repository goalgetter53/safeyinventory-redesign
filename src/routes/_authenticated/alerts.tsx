import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Info, AlertTriangle, ShieldAlert, Check } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { EmptyState } from "@/components/inventory/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { timeAgo, fmtDateTime } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const [filter, setFilter] = useState<string>("all");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", "all"],
    queryFn: async () => (await supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("alerts").update({ is_read: true }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const markAll = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("alerts").update({ is_read: true }).eq("is_read", false); if (error) throw error; },
    onSuccess: () => { toast.success("All marked read"); qc.invalidateQueries({ queryKey: ["alerts"] }); audit("update", "alerts_mark_all"); },
  });

  const filtered = (data ?? []).filter((a: any) => {
    if (filter === "unread") return !a.is_read;
    if (filter === "low") return a.alert_type.startsWith("low_stock");
    if (filter === "waste") return a.alert_type.startsWith("high_wastage");
    if (filter === "shortage") return a.alert_type === "shortage_planned";
    return true;
  });

  const unread = (data ?? []).filter((a: any) => !a.is_read).length;

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle={`${unread} unread`}
        actions={<Button variant="outline" onClick={() => markAll.mutate()} disabled={unread === 0}><Check className="h-4 w-4" /> Mark All Read</Button>}
      />

      <Tabs value={filter} onValueChange={setFilter} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="low">Low Stock</TabsTrigger>
          <TabsTrigger value="waste">High Wastage</TabsTrigger>
          <TabsTrigger value="shortage">Shortage</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
        filtered.length === 0 ? <Card><CardContent><EmptyState icon={Bell} title="No alerts" description="You're all caught up." /></CardContent></Card> :
        <div className="space-y-2">
          {filtered.map((a: any) => {
            const Icon = a.severity === "info" ? Info : a.severity === "warning" ? AlertTriangle : ShieldAlert;
            const iconColor = a.severity === "info" ? "text-blue-500" : a.severity === "warning" ? "text-warning" : "text-destructive";
            const nav = a.alert_type.includes("raw") ? "/raw-materials" : a.alert_type.includes("part") ? "/parts" : a.alert_type.includes("product") ? "/production" : "/dashboard";
            return (
              <Card key={a.id} className={cn(!a.is_read && "border-primary/40 bg-primary/5")}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <Icon className={cn("h-5 w-5 mt-0.5", iconColor)} />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate({ to: nav })}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-sm">{a.title}</div>
                        {!a.is_read && <Badge variant="secondary" className="text-[10px]">NEW</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">{a.message}</div>
                      <div className="text-xs text-muted-foreground mt-1" title={fmtDateTime(a.created_at)}>{timeAgo(a.created_at)}</div>
                    </div>
                    {!a.is_read && <Button size="sm" variant="ghost" onClick={() => markOne.mutate(a.id)}>Mark read</Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      }
    </div>
  );
}
