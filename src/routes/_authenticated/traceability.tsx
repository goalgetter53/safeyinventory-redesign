import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, GitBranch, Package, Puzzle, Factory as FactoryIcon, Users as UsersIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtKg, fmtNum } from "@/lib/inventory/format";

export const Route = createFileRoute("/_authenticated/traceability")({
  component: Traceability,
});

type Kind = "production" | "part" | "raw";
type Result = { kind: Kind; id: string; label: string };

function Traceability() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Result | null>(null);

  const { data: matches } = useQuery({
    queryKey: ["trace-search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const [r, p, pr] = await Promise.all([
        supabase.from("raw_materials").select("id,batch_number,material_type").ilike("batch_number", `%${q}%`).limit(6),
        supabase.from("part_batches").select("id,batch_number,parts(part_name)").ilike("batch_number", `%${q}%`).limit(6),
        supabase.from("production_batches").select("id,batch_number,products(product_name)").ilike("batch_number", `%${q}%`).limit(6),
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
          {q.length >= 2 && (
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
    queryFn: async () => {
      if (result.kind === "raw") {
        const rm = (await supabase.from("raw_materials").select("*, vendors(name, phone)").eq("id", result.id).single()).data;
        const pbs = (await supabase.from("part_batches").select("*, parts(part_name), production_batch_parts(quantity_used, production_batches(id,batch_number,products(product_name),quantity_produced,production_date,status))").eq("raw_material_batch_id", result.id)).data ?? [];
        return { rm, pbs, prod: null as any };
      }
      if (result.kind === "part") {
        const pb = (await supabase.from("part_batches").select("*, parts(part_name), raw_materials(*, vendors(name,phone)), production_batch_parts(quantity_used, production_batches(id,batch_number,products(product_name),quantity_produced,production_date,status))").eq("id", result.id).single()).data;
        return { rm: pb?.raw_materials, pbs: pb ? [pb] : [], prod: null as any };
      }
      const prod = (await supabase.from("production_batches").select("*, products(product_name), production_batch_parts(quantity_used, part_batches(*, parts(part_name), raw_materials(*, vendors(name,phone))))").eq("id", result.id).single()).data;
      return { rm: null, pbs: [], prod };
    },
  });

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <TraceTree data={data} />
      <WastageSummary data={data} />
    </div>
  );
}

function TraceTree({ data }: { data: any }) {
  const nodes: JSX.Element[] = [];

  if (data.prod) {
    nodes.push(
      <TreeNode key="prod" icon={FactoryIcon} title={`Production ${data.prod.batch_number}`} subtitle={`${data.prod.products?.product_name} × ${fmtNum(data.prod.quantity_produced)} · ${fmtDate(data.prod.production_date)}`} status={data.prod.status}>
        {(data.prod.production_batch_parts ?? []).map((pbp: any) => (
          <TreeNode key={pbp.part_batches?.id} icon={Puzzle} title={`Part ${pbp.part_batches?.batch_number}`} subtitle={`${pbp.part_batches?.parts?.part_name} — ${fmtNum(pbp.quantity_used)} used`}>
            <TreeNode icon={Package} title={`Raw ${pbp.part_batches?.raw_materials?.batch_number}`} subtitle={<>{<MaterialBadge material={pbp.part_batches?.raw_materials?.material_type} />} · {fmtKg(pbp.part_batches?.raw_materials?.remaining_quantity_kg)} remaining</>}>
              <TreeNode icon={UsersIcon} title={`Vendor ${pbp.part_batches?.raw_materials?.vendors?.name}`} subtitle={pbp.part_batches?.raw_materials?.vendors?.phone} />
            </TreeNode>
          </TreeNode>
        ))}
      </TreeNode>
    );
  } else if (data.pbs?.length && data.rm) {
    // part or raw view: backward = raw+vendor; forward = production batches
    nodes.push(
      <TreeNode key="rm" icon={Package} title={`Raw ${data.rm.batch_number}`} subtitle={<>{<MaterialBadge material={data.rm.material_type} />} · {fmtKg(data.rm.remaining_quantity_kg)} remaining</>}>
        <TreeNode icon={UsersIcon} title={`Vendor ${data.rm.vendors?.name}`} subtitle={data.rm.vendors?.phone} />
        {data.pbs.map((pb: any) => (
          <TreeNode key={pb.id} icon={Puzzle} title={`Part ${pb.batch_number}`} subtitle={`${pb.parts?.part_name} · ${fmtNum(pb.quantity)} units`}>
            {(pb.production_batch_parts ?? []).map((pbp: any) => (
              <TreeNode key={pbp.production_batches?.id} icon={FactoryIcon} title={`Production ${pbp.production_batches?.batch_number}`} subtitle={`${pbp.production_batches?.products?.product_name} × ${fmtNum(pbp.production_batches?.quantity_produced)}`} status={pbp.production_batches?.status} />
            ))}
          </TreeNode>
        ))}
      </TreeNode>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4"><GitBranch className="h-4 w-4" /><h2>Trace chain</h2></div>
        <div>{nodes}</div>
      </CardContent>
    </Card>
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

function WastageSummary({ data }: { data: any }) {
  const partWaste = data.prod ? (data.prod.production_batch_parts ?? []).reduce((s: number, pbp: any) => s + Number(pbp.part_batches?.wastage_kg ?? 0), 0)
                  : (data.pbs ?? []).reduce((s: number, pb: any) => s + Number(pb.wastage_kg ?? 0), 0);
  const productWaste = data.prod ? Number(data.prod.wastage_kg ?? 0) : 0;
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
