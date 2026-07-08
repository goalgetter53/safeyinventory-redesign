import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Warehouse, Package, Puzzle, Boxes } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { TableSkeleton } from "@/components/inventory/skeletons";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtKg, fmtNum } from "@/lib/inventory/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/stock")({
  component: StockPage,
});

type StockRow =
  | { type: "raw"; id: string; name: string; sub: string; material: string; stock_kg: number; low: boolean; blocked: boolean }
  | { type: "part"; id: string; name: string; sub: string; material: string; stock_units: number; threshold: number; low: boolean }
  | { type: "product"; id: string; name: string; sub: string; material: string; stock_units: number; active: boolean };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "raw", label: "Raw materials" },
  { value: "part", label: "Parts" },
  { value: "product", label: "Products" },
] as const;
type FilterValue = (typeof FILTERS)[number]["value"];

function StockPage() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");

  const { data: raws, isLoading: l1 } = useQuery({
    queryKey: ["stock", "raw"],
    queryFn: async () => (await supabase.from("raw_materials").select("id, batch_number, material_type, remaining_quantity_kg, is_blocked").eq("is_blocked", false).order("batch_number")).data ?? [],
  });

  const { data: parts, isLoading: l2 } = useQuery({
    queryKey: ["stock", "parts"],
    queryFn: async () => (await supabase.from("parts").select("id, part_name, material_type, current_stock, low_stock_threshold").order("part_name")).data ?? [],
  });

  const { data: products, isLoading: l3 } = useQuery({
    queryKey: ["stock", "products"],
    queryFn: async () => (await supabase.from("products").select("id, product_name, product_code, is_active").order("product_name")).data ?? [],
  });

  const isLoading = l1 || l2 || l3;

  const rows = useMemo<StockRow[]>(() => {
    const rawRows: StockRow[] = (raws ?? []).map((r: any) => ({
      type: "raw",
      id: r.id,
      name: r.batch_number,
      sub: r.material_type,
      material: r.material_type,
      stock_kg: Number(r.remaining_quantity_kg),
      low: Number(r.remaining_quantity_kg) < 50,
      blocked: !!r.is_blocked,
    }));
    const partRows: StockRow[] = (parts ?? []).map((p: any) => ({
      type: "part",
      id: p.id,
      name: p.part_name,
      sub: p.material_type,
      material: p.material_type,
      stock_units: Number(p.current_stock),
      threshold: Number(p.low_stock_threshold),
      low: Number(p.current_stock) < Number(p.low_stock_threshold),
    }));
    // Products don't carry an explicit stock column — derive from production_batches sum.
    // For now show "0" placeholder; the production page is the source of truth.
    const productRows: StockRow[] = (products ?? []).map((p: any) => ({
      type: "product",
      id: p.id,
      name: p.product_name,
      sub: p.product_code,
      material: "—",
      stock_units: 0,
      active: !!p.is_active,
    }));
    return [...rawRows, ...partRows, ...productRows];
  }, [raws, parts, products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.type !== filter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.sub ?? "").toLowerCase().includes(q);
    });
  }, [rows, filter, search]);

  const totals = useMemo(() => {
    const rawKg = rows.reduce((s, r) => s + (r.type === "raw" ? r.stock_kg : 0), 0);
    const partUnits = rows.reduce((s, r) => s + (r.type === "part" ? r.stock_units : 0), 0);
    const lowCount = rows.filter((r) => "low" in r && r.low).length;
    return { rawKg, partUnits, lowCount };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle={`${fmtKg(totals.rawKg)} raw · ${fmtNum(totals.partUnits)} part units · ${totals.lowCount} low-stock`}
      />

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex items-center gap-1 border rounded-md p-0.5 bg-card">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 h-7 text-[12.5px] rounded-sm transition-colors",
                filter === f.value
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="pl-8 h-8 text-[13px]"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Warehouse className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <div className="text-sm font-medium">No items match</div>
              <div className="text-xs text-muted-foreground mt-1">Adjust filters or search to see stock.</div>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={`${r.type}-${r.id}`}
                    className="cursor-pointer hover:bg-muted/40"
                  >
                    <TableCell>
                      <Link
                        to="/stock-history/$type/$id"
                        params={{ type: r.type, id: r.id }}
                        className="inline-flex items-center gap-1.5"
                      >
                        <TypeBadge type={r.type} />
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link to="/stock-history/$type/$id" params={{ type: r.type, id: r.id }} className="hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{r.sub}</div>
                    </TableCell>
                    <TableCell>
                      {r.material === "—" ? <span className="text-muted-foreground">—</span> : <MaterialBadge material={r.material} />}
                    </TableCell>
                    <TableCell className="text-right num">
                      {r.type === "raw" ? fmtKg(r.stock_kg) : fmtNum(r.stock_units)}
                    </TableCell>
                    <TableCell className="text-right num text-xs text-muted-foreground">
                      {r.type === "part" ? fmtNum(r.threshold) : "—"}
                    </TableCell>
                    <TableCell>{renderStatus(r)}</TableCell>
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

function TypeBadge({ type }: { type: "raw" | "part" | "product" }) {
  if (type === "raw") return <Badge variant="outline" className="gap-1"><Package className="h-3 w-3" /> Raw</Badge>;
  if (type === "part") return <Badge variant="outline" className="gap-1"><Puzzle className="h-3 w-3" /> Part</Badge>;
  return <Badge variant="outline" className="gap-1"><Boxes className="h-3 w-3" /> Product</Badge>;
}

function renderStatus(r: StockRow) {
  if (r.type === "raw") {
    if (r.blocked) return <Badge variant="destructive">Blocked</Badge>;
    if (r.low) return <Badge variant="outline" className="border-warning text-warning">Low</Badge>;
    return <Badge variant="secondary">Active</Badge>;
  }
  if (r.type === "part") {
    if (r.low) return <Badge variant="outline" className="border-warning text-warning">Low</Badge>;
    return <Badge variant="secondary">OK</Badge>;
  }
  return r.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>;
}