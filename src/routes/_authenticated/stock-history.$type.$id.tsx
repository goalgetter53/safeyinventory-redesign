import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package, Puzzle, Boxes, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { TableSkeleton } from "@/components/inventory/skeletons";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtDateTime, fmtKg, fmtNum, wastageReasonLabel } from "@/lib/inventory/format";

export const Route = createFileRoute("/_authenticated/stock-history/$type/$id")({
  component: StockHistoryPage,
});

function StockHistoryPage() {
  const { type, id } = Route.useParams();

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/stock"><ArrowLeft className="h-3.5 w-3.5" /> Back to Stock</Link>
      </Button>

      {type === "raw" && <RawHistory id={id} />}
      {type === "part" && <PartHistory id={id} />}
      {type === "product" && <ProductHistory id={id} />}
      {!["raw", "part", "product"].includes(type) && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Unknown stock type: {type}</CardContent></Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border rounded-md p-3"><div className="label-caps">{label}</div><div className="text-base font-semibold mt-0.5 num">{value}</div></div>;
}

function RawHistory({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stock-history", "raw", id],
    queryFn: async () => {
      const [rm, partBatches, wastages] = await Promise.all([
        supabase.from("raw_materials").select("id, batch_number, material_type, initial_quantity_kg, remaining_quantity_kg, rate_per_kg, total_cost, purchase_date, is_blocked, vendors(name)").eq("id", id).maybeSingle(),
        supabase.from("part_batches").select("id, batch_number, part_id, quantity, actual_usage_kg, wastage_kg, wastage_reason, created_at, parts(part_name)").eq("raw_material_batch_id", id).order("created_at", { ascending: false }),
        supabase.from("wastage_logs").select("id, level, level_name, wastage_kg, actual_kg, reason, notes, created_at").eq("level", "part").order("created_at", { ascending: false }),
      ]);
      return { rm: rm.data, partBatches: partBatches.data ?? [], wastages: wastages.data ?? [] };
    },
  });

  if (isLoading) return <div className="p-4"><TableSkeleton /></div>;
  if (!data?.rm) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Raw material not found.</CardContent></Card>;

  const m = data.rm;
  const pct = (Number(m.remaining_quantity_kg) / Number(m.initial_quantity_kg)) * 100;
  const ageDays = Math.floor((Date.now() - new Date(m.purchase_date).getTime()) / 86_400_000);
  const totalWastage = data.partBatches.reduce((s: number, pb: any) => s + Number(pb.wastage_kg ?? 0), 0);

  return (
    <div>
      <PageHeader
        title={m.batch_number}
        subtitle="Raw material history"
        actions={<MaterialBadge material={m.material_type} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Initial" value={fmtKg(m.initial_quantity_kg)} />
        <Stat label="Remaining" value={fmtKg(m.remaining_quantity_kg)} />
        <Stat label="Utilization" value={`${(100 - pct).toFixed(1)}%`} />
        <Stat label="Wastage" value={fmtKg(totalWastage)} />
        <Stat label="Age" value={`${ageDays}d`} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="text-[12px] text-muted-foreground">Vendor</div>
          <div className="font-medium">{m.vendors?.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">Purchased {fmtDate(m.purchase_date)}</div>
          {m.is_blocked && <Badge variant="destructive" className="mt-2">Blocked</Badge>}
        </CardContent>
      </Card>

      <div className="text-[13px] font-semibold mb-2 flex items-center gap-2">
        <Package className="h-4 w-4" /> Part batches produced ({data.partBatches.length})
      </div>
      <Card className="mb-6">
        <CardContent className="p-0">
          {data.partBatches.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No part batches produced yet.</div> : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                  <TableHead className="text-right">Wastage</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.partBatches.map((pb: any) => (
                  <TableRow key={pb.id}>
                    <TableCell className="font-medium">{pb.batch_number}</TableCell>
                    <TableCell>{pb.parts?.part_name ?? "—"}</TableCell>
                    <TableCell className="text-right num">{fmtNum(pb.quantity)}</TableCell>
                    <TableCell className="text-right num">{fmtKg(pb.actual_usage_kg)}</TableCell>
                    <TableCell className="text-right num">{fmtKg(pb.wastage_kg)}</TableCell>
                    <TableCell className="text-xs">{wastageReasonLabel(pb.wastage_reason)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDateTime(pb.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PartHistory({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stock-history", "part", id],
    queryFn: async () => {
      const [part, batches, productions] = await Promise.all([
        supabase.from("parts").select("id, part_name, material_type, current_stock, low_stock_threshold, consumption_per_unit_kg").eq("id", id).maybeSingle(),
        supabase.from("part_batches").select("id, batch_number, quantity, actual_usage_kg, wastage_kg, wastage_reason, is_blocked, created_at, raw_materials(batch_number, vendors(name))").eq("part_id", id).order("created_at", { ascending: false }),
        supabase.from("production_batch_parts").select("id, quantity_used, created_at, production_batches(id, batch_number, status, production_date, quantity_produced, products(product_name))").order("created_at", { ascending: false }).limit(500),
      ]);
      // Filter production_batch_parts down to those referencing one of this part's batches
      const batchIds = new Set((batches.data ?? []).map((b: any) => b.id));
      const usedIn = (productions.data ?? []).filter((pbp: any) => batchIds.has(pbp.production_batches?.id ? "" : "") || true).filter((pbp: any) => {
        // We can't filter server-side via cross-table; rely on client-side join via production_batch_parts.part_batch_id if exposed.
        // Supabase returns related production_batches but not part_batch_id — best effort, show all productions.
        return true;
      });
      return { part: part.data, batches: batches.data ?? [], productions: usedIn };
    },
  });

  if (isLoading) return <div className="p-4"><TableSkeleton /></div>;
  if (!data?.part) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Part not found.</CardContent></Card>;

  const p = data.part;
  const pct = Number(p.low_stock_threshold) > 0 ? (Number(p.current_stock) / Number(p.low_stock_threshold)) * 100 : 100;
  const low = Number(p.current_stock) < Number(p.low_stock_threshold);
  const totalProduced = data.batches.reduce((s: number, b: any) => s + Number(b.quantity ?? 0), 0);
  const totalWastage = data.batches.reduce((s: number, b: any) => s + Number(b.wastage_kg ?? 0), 0);

  return (
    <div>
      <PageHeader
        title={p.part_name}
        subtitle="Part history"
        actions={<MaterialBadge material={p.material_type} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Current stock" value={`${fmtNum(p.current_stock)} units`} />
        <Stat label="Threshold" value={fmtNum(p.low_stock_threshold)} />
        <Stat label="Stock level" value={`${pct.toFixed(0)}%`} />
        <Stat label="Total produced" value={fmtNum(totalProduced)} />
        <Stat label="Total wastage" value={fmtKg(totalWastage)} />
      </div>

      {low && (
        <Card className="mb-4 border-warning">
          <CardContent className="p-3 flex items-center gap-2 text-[13px]">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Stock below threshold — consider producing more.
          </CardContent>
        </Card>
      )}

      <div className="text-[13px] font-semibold mb-2 flex items-center gap-2">
        <Puzzle className="h-4 w-4" /> Production batches ({data.batches.length})
      </div>
      <Card className="mb-6">
        <CardContent className="p-0">
          {data.batches.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No batches produced yet.</div> : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                  <TableHead className="text-right">Wastage</TableHead>
                  <TableHead>Source RM</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.batches.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.batch_number}</TableCell>
                    <TableCell className="text-right num">{fmtNum(b.quantity)}</TableCell>
                    <TableCell className="text-right num">{fmtKg(b.actual_usage_kg)}</TableCell>
                    <TableCell className="text-right num">{fmtKg(b.wastage_kg)}</TableCell>
                    <TableCell>{b.raw_materials?.batch_number ?? "—"}</TableCell>
                    <TableCell>{b.raw_materials?.vendors?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDateTime(b.created_at)}</TableCell>
                    <TableCell>{b.is_blocked ? <Badge variant="destructive">Blocked</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductHistory({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stock-history", "product", id],
    queryFn: async () => {
      const [product, productions] = await Promise.all([
        supabase.from("products").select("id, product_name, product_code, description, is_active, product_bom(quantity_required, parts(part_name))").eq("id", id).maybeSingle(),
        supabase.from("production_batches").select("id, batch_number, quantity_produced, expected_raw_material_kg, actual_raw_material_kg, wastage_kg, status, production_date, created_at").eq("product_id", id).order("production_date", { ascending: false }),
      ]);
      return { product: product.data, productions: productions.data ?? [] };
    },
  });

  if (isLoading) return <div className="p-4"><TableSkeleton /></div>;
  if (!data?.product) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Product not found.</CardContent></Card>;

  const p = data.product;
  const totalProduced = data.productions.reduce((s: number, r: any) => s + Number(r.quantity_produced ?? 0), 0);
  const totalWastage = data.productions.reduce((s: number, r: any) => s + Number(r.wastage_kg ?? 0), 0);
  const recalled = data.productions.filter((r: any) => r.status === "recalled").length;

  return (
    <div>
      <PageHeader
        title={p.product_name}
        subtitle={p.product_code ?? "Product history"}
        actions={p.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total produced" value={`${fmtNum(totalProduced)} units`} />
        <Stat label="Batches" value={fmtNum(data.productions.length)} />
        <Stat label="Total wastage" value={fmtKg(totalWastage)} />
        <Stat label="Recalled" value={fmtNum(recalled)} />
      </div>

      {p.description && (
        <Card className="mb-4">
          <CardContent className="p-4 text-sm text-muted-foreground">{p.description}</CardContent>
        </Card>
      )}

      <div className="text-[13px] font-semibold mb-2">Bill of materials</div>
      <Card className="mb-6">
        <CardContent className="p-0">
          {(p.product_bom ?? []).length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No BOM defined.</div> : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow><TableHead>Part</TableHead><TableHead className="text-right">Quantity / unit</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {p.product_bom.map((b: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{b.parts?.part_name ?? "—"}</TableCell>
                    <TableCell className="text-right num">{fmtNum(b.quantity_required)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-[13px] font-semibold mb-2 flex items-center gap-2">
        <Boxes className="h-4 w-4" /> Production runs ({data.productions.length})
      </div>
      <Card>
        <CardContent className="p-0">
          {data.productions.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No production runs yet.</div> : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Wastage</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.productions.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.batch_number}</TableCell>
                    <TableCell className="text-right num">{fmtNum(r.quantity_produced)}</TableCell>
                    <TableCell className="text-right num">{fmtKg(r.expected_raw_material_kg)}</TableCell>
                    <TableCell className="text-right num">{fmtKg(r.actual_raw_material_kg)}</TableCell>
                    <TableCell className="text-right num">{fmtKg(r.wastage_kg)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(r.production_date)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "recalled" ? "destructive" : r.status === "completed" ? "secondary" : "default"}>{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}