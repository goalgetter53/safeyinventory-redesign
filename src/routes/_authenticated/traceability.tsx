import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, GitBranch, Package, Puzzle, Factory as FactoryIcon, Users as UsersIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PageHeader } from "@/components/inventory/page-header";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtKg, fmtNum } from "@/lib/inventory/format";

export const Route = createFileRoute("/_authenticated/traceability")({
  component: Traceability,
});

type Kind = "production" | "part" | "raw";
type Result = { kind: Kind; id: string; label: string };

function Traceability() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [selected, setSelected] = useState<Result | null>(null);

  const { data: matches } = useQuery({
    queryKey: ["trace-search", debouncedQ],
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const [r, p, pr] = await Promise.all([
        supabase.from("raw_materials").select("id,batch_number,material_type").ilike("batch_number", `%${debouncedQ}%`).limit(6),
        supabase.from("part_batches").select("id,batch_number,parts(part_name)").ilike("batch_number", `%${debouncedQ}%`).limit(6),
        supabase.from("production_batches").select("id,batch_number,products(product_name)").ilike("batch_number", `%${debouncedQ}%`).limit(6),
      ]);
      const out: Result[] = [];
      (r.data ?? []).forEach((x: any) => out.push({ kind: "raw", id: x.id, label: `${x.batch_number} · ${x.material_type} (raw)` }));
      (p.data ?? []).forEach((x: any) => out.push({ kind: "part", id: x.id, label: `${x.batch_number} · ${x.parts?.part_name} (part)` }));
      (pr.data ?? []).forEach((x: any) => out.push({ kind: "production", id: x.id, label: `${x.batch_number} · ${x.products?.product_name} (production)` }));
      return out;
    },
  });

  return (
    <div>
      <PageHeader title="Traceability" subtitle="Full forward and backward batch tracking" />

      <Card className="mb-6">
        <CardContent className="pt-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by batch number…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-11" />
          </div>
          {debouncedQ.length >= 2 && (
            <div className="border rounded-md divide-y">
              {(matches ?? []).length === 0 ? <div className="p-3 text-sm text-muted-foreground">No matches</div> :
                (matches ?? []).map((m) => (
                  <button key={m.kind + m.id} className="w-full text-left p-3 hover:bg-accent text-sm" onClick={() => { setSelected(m); setQ(""); }}>
                    {m.label}
                  </button>
                ))
              }
            </div>
          )}
        </CardContent>
      </Card>

      {selected && <TraceView result={selected} />}
    </div>
  );
}

function TraceView({ result }: { result: Result }) {
  const { data } = useQuery({
    queryKey: ["trace", result.kind, result.id],
    staleTime: 60_000,
    queryFn: async () => {
      // Single RPC call replaces the previous N-query embed chain.
      if (result.kind === "production") {
        const { data, error } = await supabase.rpc("get_traceability_backward", { p_production_batch_id: result.id });
        if (error) throw error;
        return { mode: "backward" as const, payload: data as any };
      }
      if (result.kind === "raw") {
        const { data, error } = await supabase.rpc("get_traceability_forward", { p_raw_material_id: result.id });
        if (error) throw error;
        return { mode: "forward" as const, payload: data as any };
      }
      // part: fetch the part batch's raw_material_batch_id, then reuse the forward RPC scoped to just this part batch
      const { data: pb, error: pbErr } = await supabase.from("part_batches").select("raw_material_batch_id").eq("id", result.id).single();
      if (pbErr) throw pbErr;
      const { data, error } = await supabase.rpc("get_traceability_forward", { p_raw_material_id: pb.raw_material_batch_id });
      if (error) throw error;
      // Narrow the returned part_batches to just this one for the tree view.
      const filtered = { ...(data as any), part_batches: ((data as any).part_batches ?? []).filter((x: any) => x.id === result.id) };
      return { mode: "forward" as const, payload: filtered };
    },
  });

  if (!data) return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      <TraceTree data={data} />
      <WastageSummary data={data} />
    </div>
  );
}

function TraceTree({ data }: { data: { mode: "forward" | "backward"; payload: any } }) {
  const { mode, payload } = data;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4"><GitBranch className="h-4 w-4" /><h2>Trace chain</h2></div>
        <div>
          {mode === "backward" ? <BackwardTree payload={payload} /> : <ForwardTree payload={payload} />}
        </div>
      </CardContent>
    </Card>
  );
}

function BackwardTree({ payload }: { payload: any }) {
  const prod = payload?.production;
  if (!prod) return null;
  return (
    <TreeNode icon={FactoryIcon} title={`Production ${prod.batch_number}`} subtitle={`${prod.product_name} × ${fmtNum(prod.quantity_produced)} · ${fmtDate(prod.production_date)}`} status={prod.status}>
      {(payload.parts ?? []).map((p: any) => (
        <TreeNode key={p.part_batch?.id} icon={Puzzle} title={`Part ${p.part_batch?.batch_number}`} subtitle={`${p.part_batch?.part_name} — ${fmtNum(p.quantity_used)} used`}>
          <TreeNode icon={Package} title={`Raw ${p.part_batch?.raw_material?.batch_number}`} subtitle={<>{<MaterialBadge material={p.part_batch?.raw_material?.material_type} />} · {fmtKg(p.part_batch?.raw_material?.remaining_quantity_kg)} remaining</>}>
            <TreeNode icon={UsersIcon} title={`Vendor ${p.part_batch?.raw_material?.vendor?.name}`} subtitle={p.part_batch?.raw_material?.vendor?.phone} />
          </TreeNode>
        </TreeNode>
      ))}
    </TreeNode>
  );
}

function ForwardTree({ payload }: { payload: any }) {
  const rm = payload?.raw_material;
  if (!rm) return null;
  return (
    <TreeNode icon={Package} title={`Raw ${rm.batch_number}`} subtitle={<>{<MaterialBadge material={rm.material_type} />} · {fmtKg(rm.remaining_quantity_kg)} remaining</>}>
      <TreeNode icon={UsersIcon} title={`Vendor ${rm.vendor?.name}`} subtitle={rm.vendor?.phone} />
      {(payload.part_batches ?? []).map((pb: any) => (
        <TreeNode key={pb.id} icon={Puzzle} title={`Part ${pb.batch_number}`} subtitle={`${pb.part_name} · ${fmtNum(pb.quantity)} units`}>
          {(pb.productions ?? []).map((p: any) => (
            <TreeNode key={p.id} icon={FactoryIcon} title={`Production ${p.batch_number}`} subtitle={`${p.product_name} × ${fmtNum(p.quantity_produced)}`} status={p.status} />
          ))}
        </TreeNode>
      ))}
    </TreeNode>
  );
}

function TreeNode({ icon: Icon, title, subtitle, children, status }: { icon: any; title: string; subtitle?: React.ReactNode; children?: React.ReactNode; status?: string }) {
  return (
    <div className="border-l-2 border-border pl-4 ml-2 pt-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{title}</span>
        {status && <Badge variant={status === "recalled" ? "destructive" : "secondary"} className="text-[10px]">{status}</Badge>}
      </div>
      {subtitle && <div className="text-xs text-muted-foreground ml-6">{subtitle}</div>}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

function WastageSummary({ data }: { data: { mode: "forward" | "backward"; payload: any } }) {
  const partWaste = data.mode === "backward"
    ? (data.payload.parts ?? []).reduce((s: number, p: any) => s + Number(p.part_batch?.wastage_kg ?? 0), 0)
    : (data.payload.part_batches ?? []).reduce((s: number, pb: any) => s + Number(pb.wastage_kg ?? 0), 0);
  const productWaste = data.mode === "backward" ? Number(data.payload.production?.wastage_kg ?? 0) : 0;
  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-3">Wastage summary</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-md p-3"><div className="label-caps">Part-level wastage</div><div className="text-xl font-bold">{fmtKg(partWaste)}</div></div>
          <div className="border rounded-md p-3"><div className="label-caps">Product-level wastage</div><div className="text-xl font-bold">{fmtKg(productWaste)}</div></div>
        </div>
      </CardContent>
    </Card>
  );
}
