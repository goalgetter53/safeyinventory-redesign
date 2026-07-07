import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Boxes, Factory, Users, Wrench, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtKg, fmtNum, fmtDate } from "@/lib/inventory/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [rm, prodAll, todayProd, vendors, parts, products] = await Promise.all([
        supabase.from("raw_materials").select("id,remaining_quantity_kg,material_type").eq("is_blocked", false),
        supabase.from("production_batches").select("id,quantity_produced"),
        supabase.from("production_batches").select("id,quantity_produced").eq("production_date", today),
        supabase.from("vendors").select("id", { count: "exact", head: true }),
        supabase.from("parts").select("id,current_stock"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      const totalRaw = (rm.data ?? []).reduce((s, r) => s + Number(r.remaining_quantity_kg), 0);
      const materialTypes = new Set((rm.data ?? []).map((r) => r.material_type)).size;
      const totalGoods = (prodAll.data ?? []).reduce((s, r) => s + Number(r.quantity_produced), 0);
      const todayUnits = (todayProd.data ?? []).reduce((s, r) => s + Number(r.quantity_produced), 0);
      const partsStock = (parts.data ?? []).reduce((s, p) => s + Number(p.current_stock), 0);
      return {
        totalRaw,
        materialTypes,
        totalGoods,
        productsCount: products.count ?? 0,
        todayUnits,
        prodBatches: prodAll.data?.length ?? 0,
        vendorsCount: vendors.count ?? 0,
        partsStock,
        rmBatches: rm.data?.length ?? 0,
      };
    },
  });

  const cards = [
    { to: "/raw-materials", icon: Layers, iconBg: "bg-primary/10 text-primary", label: "Total Raw Material Stock", value: data ? fmtKg(data.totalRaw, 1) : undefined, sub: data ? `${data.materialTypes} materials tracked` : undefined },
    { to: "/products", icon: Boxes, iconBg: "bg-emerald-100 text-emerald-700", label: "Total Finished Goods", value: data ? fmtNum(data.totalGoods) : undefined, sub: data ? `${data.productsCount} products` : undefined },
    { to: "/production", icon: Factory, iconBg: "bg-amber-100 text-amber-700", label: "Today Production", value: data ? fmtNum(data.todayUnits) : undefined, sub: data ? `${data.prodBatches} batches all-time` : undefined },
    { to: "/vendors", icon: Users, iconBg: "bg-primary/10 text-primary", label: "Vendors", value: data ? fmtNum(data.vendorsCount) : undefined },
    { to: "/parts", icon: Wrench, iconBg: "bg-primary/10 text-primary", label: "Parts in Stock", value: data ? fmtNum(data.partsStock) : undefined },
    { to: "/raw-materials", icon: Package, iconBg: "bg-primary/10 text-primary", label: "RM Batches", value: data ? fmtNum(data.rmBatches) : undefined },
  ] as const;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={fmtDate(new Date())} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="group">
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
