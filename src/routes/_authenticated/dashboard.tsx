import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Boxes, Factory, TrendingDown, Plus, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtKg, fmtNum, fmtDate, timeAgo } from "@/lib/inventory/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [rm, prod, todayProd, todayWaste, lowRaw, lowParts, recent] = await Promise.all([
        supabase.from("raw_materials").select("remaining_quantity_kg,is_blocked").eq("is_blocked", false),
        supabase.from("production_batches").select("quantity_produced,status").eq("status", "completed"),
        supabase.from("production_batches").select("id,quantity_produced").eq("production_date", today),
        supabase.from("wastage_logs").select("expected_kg,actual_kg,wastage_kg").gte("created_at", today),
        supabase.from("raw_materials").select("id,batch_number,material_type,remaining_quantity_kg").eq("is_blocked", false).lt("remaining_quantity_kg", 50),
        supabase.from("parts").select("id,part_name,current_stock,low_stock_threshold"),
        supabase.from("production_batches").select("id,batch_number,quantity_produced,status,created_at,products(product_name)").order("created_at", { ascending: false }).limit(10),
      ]);
      const totalRaw = (rm.data ?? []).reduce((s, r) => s + Number(r.remaining_quantity_kg), 0);
      const totalGoods = (prod.data ?? []).reduce((s, r) => s + Number(r.quantity_produced), 0);
      const todayCount = todayProd.data?.length ?? 0;
      const todayUnits = (todayProd.data ?? []).reduce((s, r) => s + Number(r.quantity_produced), 0);
      const actualSum = (todayWaste.data ?? []).reduce((s, r) => s + Number(r.actual_kg), 0);
      const wasteSum = (todayWaste.data ?? []).reduce((s, r) => s + Number(r.wastage_kg), 0);
      const wastePct = actualSum > 0 ? (wasteSum / actualSum) * 100 : 0;
      const lowStockParts = (lowParts.data ?? []).filter((p) => Number(p.current_stock) < Number(p.low_stock_threshold));
      return {
        totalRaw, activeBatches: rm.data?.length ?? 0,
        totalGoods, prodCount: prod.data?.length ?? 0,
        todayCount, todayUnits,
        wastePct,
        lowRaw: lowRaw.data ?? [], lowParts: lowStockParts,
        recent: recent.data ?? [],
      };
    },
  });

  const wasteColor = !data ? "" : data.wastePct < 5 ? "text-success" : data.wastePct < 10 ? "text-warning" : "text-destructive";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={fmtDate(new Date())}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={Package} label="Total Raw Material Stock" value={data ? fmtKg(data.totalRaw) : undefined} sub={data ? `across ${data.activeBatches} active batches` : undefined} loading={isLoading} />
        <KpiCard icon={Boxes} label="Total Finished Goods" value={data ? fmtNum(data.totalGoods) + " units" : undefined} sub={data ? `across ${data.prodCount} production batches` : undefined} loading={isLoading} />
        <KpiCard icon={Factory} label="Today's Production" value={data ? `${data.todayCount} batches` : undefined} sub={data ? `${fmtNum(data.todayUnits)} units today` : undefined} loading={isLoading} />
        <KpiCard icon={TrendingDown} label="Today's Wastage %" value={data ? `${data.wastePct.toFixed(2)}%` : undefined} valueClass={wasteColor} sub="all levels combined" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Low Stock Alerts</CardTitle>
            {data && <Badge variant="secondary">{data.lowRaw.length + data.lowParts.length}</Badge>}
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-32" /> : (data && data.lowRaw.length + data.lowParts.length === 0 ? (
              <div className="flex items-center gap-3 text-success py-6">
                <CheckCircle2 className="h-5 w-5" />
                <div className="text-sm">All stock levels healthy.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {data?.lowRaw.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border rounded-md p-3">
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{r.batch_number} <span className="text-muted-foreground">· {r.material_type}</span></div>
                        <div className="text-xs text-muted-foreground">{fmtKg(r.remaining_quantity_kg)} remaining · threshold 50 kg</div>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline"><Link to="/raw-materials">Reorder</Link></Button>
                  </div>
                ))}
                {data?.lowParts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border rounded-md p-3">
                    <div className="flex items-center gap-3">
                      <Boxes className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{p.part_name}</div>
                        <div className="text-xs text-muted-foreground">{fmtNum(p.current_stock)} in stock · threshold {fmtNum(p.low_stock_threshold)}</div>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline"><Link to="/parts">Produce</Link></Button>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <Skeleton className="h-32" /> : (data?.recent.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No production yet.</div>
            ) : data?.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{r.batch_number}</div>
                  <div className="text-xs text-muted-foreground">{(r as any).products?.product_name} · {fmtNum(r.quantity_produced)} units</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</div>
                  <Badge variant={r.status === "recalled" ? "destructive" : "secondary"} className="text-[10px]">{r.status}</Badge>
                </div>
              </div>
            )))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild><Link to="/production"><Plus className="h-4 w-4" /> Start Production</Link></Button>
        <Button asChild variant="outline"><Link to="/raw-materials">Add Raw Material</Link></Button>
        <Button asChild variant="outline"><Link to="/parts">Create Part Batch</Link></Button>
        <Button asChild variant="ghost"><Link to="/reports">View Reports <ArrowRight className="h-4 w-4" /></Link></Button>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, loading, valueClass }: {
  icon: any; label: string; value?: string; sub?: string; loading?: boolean; valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="label-caps">{label}</div>
            {loading ? <Skeleton className="h-8 w-24 mt-2" /> : <div className={cn("text-2xl font-bold mt-1", valueClass)}>{value}</div>}
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          <div className="rounded-md bg-primary/10 p-2"><Icon className="h-5 w-5 text-primary" /></div>
        </div>
      </CardContent>
    </Card>
  );
}
