import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Boxes, Factory, Users, Wrench, Layers, Bell, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtKg, fmtNum, fmtDate } from "@/lib/inventory/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Kpis = {
  total_raw_stock_kg: number;
  active_raw_batches: number;
  material_types: number;
  total_finished_goods: number;
  total_production_batches: number;
  todays_batches: number;
  todays_units: number;
  todays_wastage_kg: number;
  todays_actual_kg: number;
  vendors_count: number;
  active_products: number;
  parts_stock: number;
  low_stock_parts: number;
  low_stock_raw: number;
  unread_alerts: number;
};

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-kpis"],
    // Dashboard aggregates change slowly relative to a page mount; cache 60 s.
    staleTime: 60_000,
    queryFn: async (): Promise<Kpis> => {
      const { data, error } = await supabase.rpc("get_dashboard_kpis");
      if (error) throw error;
      return data as unknown as Kpis;
    },
  });

  const cards: Array<{ to: string; icon: any; iconBg: string; label: string; value?: string; sub?: string }> = [
    { to: "/raw-materials", icon: Layers, iconBg: "bg-primary/10 text-primary", label: "Total Raw Material Stock", value: data ? fmtKg(Number(data.total_raw_stock_kg), 1) : undefined, sub: data ? `${data.material_types} materials · ${data.active_raw_batches} batches` : undefined },
    { to: "/products", icon: Boxes, iconBg: "bg-emerald-100 text-emerald-700", label: "Total Finished Goods", value: data ? fmtNum(Number(data.total_finished_goods)) : undefined, sub: data ? `${data.active_products} products` : undefined },
    { to: "/production", icon: Factory, iconBg: "bg-amber-100 text-amber-700", label: "Today Production", value: data ? fmtNum(Number(data.todays_units)) : undefined, sub: data ? `${data.todays_batches} batches today · ${data.total_production_batches} all-time` : undefined },
    { to: "/vendors", icon: Users, iconBg: "bg-primary/10 text-primary", label: "Vendors", value: data ? fmtNum(data.vendors_count) : undefined },
    { to: "/parts", icon: Wrench, iconBg: "bg-primary/10 text-primary", label: "Parts in Stock", value: data ? fmtNum(Number(data.parts_stock)) : undefined, sub: data && data.low_stock_parts > 0 ? `${data.low_stock_parts} below threshold` : undefined },
    { to: "/raw-materials", icon: Package, iconBg: "bg-primary/10 text-primary", label: "RM Batches", value: data ? fmtNum(data.active_raw_batches) : undefined, sub: data && data.low_stock_raw > 0 ? `${data.low_stock_raw} running low` : undefined },
    { to: "/alerts", icon: Bell, iconBg: "bg-primary/10 text-primary", label: "Unread Alerts", value: data ? fmtNum(data.unread_alerts) : undefined },
    { to: "/reports", icon: AlertTriangle, iconBg: "bg-primary/10 text-primary", label: "Today's Wastage", value: data ? fmtKg(Number(data.todays_wastage_kg), 2) : undefined, sub: data && Number(data.todays_actual_kg) > 0 ? `${((Number(data.todays_wastage_kg) / Number(data.todays_actual_kg)) * 100).toFixed(1)}% of actual` : undefined },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={fmtDate(new Date())} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to as any} className="group">
            <Card className="transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className={cn("inline-flex rounded-md p-2 mb-4", c.iconBg)}>
                  <c.icon className="h-5 w-5" />
                </div>
                <div className="label-caps">{c.label}</div>
                {isLoading || !c.value ? (
                  <Skeleton className="h-8 w-24 mt-2" />
                ) : (
                  <div className="text-3xl font-bold mt-1">{c.value}</div>
                )}
                {c.sub && <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
