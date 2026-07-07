import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, lazy, Suspense } from "react";
import { Download, BarChart3 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/inventory/skeletons";
import { fmtDate, fmtKg, fmtNum, fmtCurrency, wastageReasonLabel } from "@/lib/inventory/format";
import { downloadCsv } from "@/lib/inventory/csv";

// Recharts is ~90KB gzipped — load it only when Reports is opened.
const WastageCharts = lazy(() => import("@/components/reports/wastage-charts"));
const MonthlyChart = lazy(() => import("@/components/reports/monthly-chart"));

const ChartFallback = ({ height = 260 }: { height?: number }) => <Skeleton className="w-full" style={{ height }} />;

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Analytics and insights" />
      <Tabs defaultValue="wastage">
        <TabsList><TabsTrigger value="wastage">Wastage</TabsTrigger><TabsTrigger value="monthly">Monthly Production</TabsTrigger><TabsTrigger value="stock">Stock</TabsTrigger></TabsList>
        <TabsContent value="wastage"><WastageReport /></TabsContent>
        <TabsContent value="monthly"><MonthlyReport /></TabsContent>
        <TabsContent value="stock"><StockReport /></TabsContent>
      </Tabs>
    </div>
  );
}

function WastageReport() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data } = useQuery({
    queryKey: ["wastage_logs", from, to],
    queryFn: async () => (await supabase.from("wastage_logs").select("*").gte("created_at", from).lte("created_at", `${to}T23:59:59`).order("created_at", { ascending: false })).data ?? [],
  });

  const total = (data ?? []).reduce((s, r: any) => s + Number(r.wastage_kg), 0);
  const totalActual = (data ?? []).reduce((s, r: any) => s + Number(r.actual_kg), 0);
  const avgPct = totalActual > 0 ? (total / totalActual) * 100 : 0;

  const byReason = useMemo(() => {
    const map = new Map<string, number>();
    (data ?? []).forEach((r: any) => map.set(r.reason, (map.get(r.reason) ?? 0) + Number(r.wastage_kg)));
    return Array.from(map.entries()).map(([reason, kg]) => ({ reason: wastageReasonLabel(reason), kg: Number(kg.toFixed(3)) }));
  }, [data]);

  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    (data ?? []).forEach((r: any) => {
      const d = String(r.created_at).slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + Number(r.wastage_kg));
    });
    return Array.from(map.entries()).sort().map(([date, kg]) => ({ date, kg: Number(kg.toFixed(3)) }));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div><Label className="label-caps">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></div>
        <div><Label className="label-caps">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></div>
        <Button variant="outline" onClick={() => downloadCsv("wastage.csv", (data ?? []).map((r: any) => ({ date: fmtDate(r.created_at), level: r.level, level_name: r.level_name, expected_kg: r.expected_kg, actual_kg: r.actual_kg, wastage_kg: r.wastage_kg, wastage_pct: r.wastage_percentage, reason: r.reason, notes: r.notes ?? "" })))}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi label="Total wastage" value={fmtKg(total)} />
        <Kpi label="Avg wastage %" value={`${avgPct.toFixed(2)}%`} />
        <Kpi label="Log entries" value={fmtNum(data?.length ?? 0)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Wastage by reason (kg)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byReason}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="reason" /><YAxis /><Tooltip /><Bar dataKey="kg" fill="var(--color-chart-1)" /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Wastage trend (kg over time)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={byDate}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Line type="monotone" dataKey="kg" stroke="var(--color-chart-4)" /></LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Level</TableHead><TableHead>Reference</TableHead><TableHead>Expected</TableHead><TableHead>Actual</TableHead><TableHead>Wastage</TableHead><TableHead>%</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data ?? []).slice(0, 100).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                  <TableCell>{r.level}</TableCell>
                  <TableCell className="text-xs">{r.level_name}</TableCell>
                  <TableCell>{fmtKg(r.expected_kg)}</TableCell>
                  <TableCell>{fmtKg(r.actual_kg)}</TableCell>
                  <TableCell>{fmtKg(r.wastage_kg)}</TableCell>
                  <TableCell>{Number(r.wastage_percentage).toFixed(2)}%</TableCell>
                  <TableCell className="text-xs">{wastageReasonLabel(r.reason)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function MonthlyReport() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const from = `${month}-01`;
  const nextMonth = new Date(from); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const to = nextMonth.toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["monthly_production", month],
    queryFn: async () => (await supabase.from("production_batches").select("*, products(product_name)").gte("production_date", from).lt("production_date", to).order("production_date")).data ?? [],
  });

  const totalBatches = data?.length ?? 0;
  const totalUnits = (data ?? []).reduce((s, r: any) => s + Number(r.quantity_produced), 0);
  const totalWaste = (data ?? []).reduce((s, r: any) => s + Number(r.wastage_kg), 0);
  const totalActual = (data ?? []).reduce((s, r: any) => s + Number(r.actual_raw_material_kg), 0);

  const chartData = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    (data ?? []).forEach((r: any) => {
      const d = String(r.production_date);
      const row = map.get(d) ?? { date: d };
      const p = r.products?.product_name ?? "Unknown";
      row[p] = (row[p] ?? 0) + Number(r.quantity_produced);
      map.set(d, row);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);
  const products = Array.from(new Set((data ?? []).map((r: any) => r.products?.product_name ?? "Unknown")));
  const colors = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div><Label className="label-caps">Month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1" /></div>
        <Button variant="outline" onClick={() => downloadCsv("monthly_production.csv", (data ?? []).map((r: any) => ({ batch: r.batch_number, product: r.products?.product_name, quantity: r.quantity_produced, expected_kg: r.expected_raw_material_kg, actual_kg: r.actual_raw_material_kg, wastage_kg: r.wastage_kg, date: r.production_date, status: r.status })))}><Download className="h-4 w-4" /> CSV</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Kpi label="Batches" value={fmtNum(totalBatches)} />
        <Kpi label="Units produced" value={fmtNum(totalUnits)} />
        <Kpi label="Wastage" value={fmtKg(totalWaste)} />
        <Kpi label="Avg wastage %" value={`${(totalActual > 0 ? (totalWaste / totalActual) * 100 : 0).toFixed(2)}%`} />
      </div>
      <ChartCard title="Units produced by product / day">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend />{products.map((p, i) => <Bar key={p} dataKey={p} stackId="a" fill={colors[i % colors.length]} />)}</BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Wastage</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.batch_number}</TableCell>
                  <TableCell>{r.products?.product_name}</TableCell>
                  <TableCell>{fmtNum(r.quantity_produced)}</TableCell>
                  <TableCell>{fmtKg(r.wastage_kg)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(r.production_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StockReport() {
  const { data } = useQuery({
    queryKey: ["stock_report"],
    queryFn: async () => {
      const [rm, parts, prod] = await Promise.all([
        supabase.from("raw_materials").select("*, vendors(name)").order("material_type"),
        supabase.from("parts").select("*").order("part_name"),
        supabase.from("production_batches").select("product_id, quantity_produced, products(product_name)"),
      ]);
      const prodByProduct = new Map<string, { name: string; total: number }>();
      (prod.data ?? []).forEach((r: any) => {
        const key = r.product_id;
        const row = prodByProduct.get(key) ?? { name: r.products?.product_name ?? "", total: 0 };
        row.total += Number(r.quantity_produced);
        prodByProduct.set(key, row);
      });
      return { rm: rm.data ?? [], parts: parts.data ?? [], goods: Array.from(prodByProduct.values()) };
    },
  });

  function exportAll() {
    if (!data) return;
    const rows = [
      ...data.rm.map((r: any) => ({ section: "Raw Material", key: r.batch_number, name: r.material_type, vendor: r.vendors?.name, remaining_kg: r.remaining_quantity_kg, value: Number(r.remaining_quantity_kg) * Number(r.rate_per_kg), status: r.is_blocked ? "blocked" : "active" })),
      ...data.parts.map((p: any) => ({ section: "Part", key: p.part_name, name: p.material_type, vendor: "", remaining_kg: p.current_stock, value: "", status: "" })),
      ...data.goods.map((g: any) => ({ section: "Finished Goods", key: g.name, name: "", vendor: "", remaining_kg: "", value: g.total, status: "" })),
    ];
    downloadCsv("stock_report.csv", rows);
  }

  const rmTotal = (data?.rm ?? []).reduce((s: number, r: any) => s + Number(r.remaining_quantity_kg) * Number(r.rate_per_kg), 0);

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={exportAll}><Download className="h-4 w-4" /> Export all</Button>
      <Card>
        <CardHeader><CardTitle>Raw materials</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Material</TableHead><TableHead>Vendor</TableHead><TableHead>Remaining</TableHead><TableHead>Value</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.rm ?? []).map((r: any) => (
                <TableRow key={r.id}><TableCell>{r.batch_number}</TableCell><TableCell>{r.material_type}</TableCell><TableCell>{r.vendors?.name}</TableCell><TableCell>{fmtKg(r.remaining_quantity_kg)}</TableCell><TableCell>{fmtCurrency(Number(r.remaining_quantity_kg) * Number(r.rate_per_kg))}</TableCell><TableCell>{r.is_blocked ? "Blocked" : "Active"}</TableCell></TableRow>
              ))}
              <TableRow className="font-semibold bg-muted/50"><TableCell colSpan={4}>Total value</TableCell><TableCell>{fmtCurrency(rmTotal)}</TableCell><TableCell></TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Parts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Material</TableHead><TableHead>Stock</TableHead><TableHead>Threshold</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.parts ?? []).map((p: any) => (
                <TableRow key={p.id}><TableCell>{p.part_name}</TableCell><TableCell>{p.material_type}</TableCell><TableCell>{fmtNum(p.current_stock)}</TableCell><TableCell>{fmtNum(p.low_stock_threshold)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Finished goods</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Total produced</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.goods ?? []).map((g: any, i: number) => (
                <TableRow key={i}><TableCell>{g.name}</TableCell><TableCell>{fmtNum(g.total)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><div className="label-caps">{label}</div><div className="text-2xl font-bold mt-1">{value}</div></CardContent></Card>;
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> {title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card>;
}
