import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Puzzle, ChevronDown, ChevronRight, Pencil, Loader2, Factory } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { EmptyState } from "@/components/inventory/empty-state";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { TableSkeleton } from "@/components/inventory/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIAL_TYPES, WASTAGE_REASONS, fmtDate, fmtKg, fmtNum, wastageReasonLabel } from "@/lib/inventory/format";
import { PartProduceDialog } from "@/components/inventory/part-produce-dialog";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/parts")({
  component: PartsPage,
});

const schema = z.object({
  part_name: z.string().trim().min(1).max(100),
  material_type: z.enum(["PC", "POM", "PP", "TPE"]),
  consumption_per_unit_kg: z.coerce.number().positive("Must be > 0"),
  low_stock_threshold: z.coerce.number().min(0),
  notes: z.string().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function PartsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [produce, setProduce] = useState<any | null>(null);

  const { data: parts, isLoading } = useQuery({
    queryKey: ["parts"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await supabase.from("parts").select("*").order("part_name")).data ?? [],
  });

  const totalStock = (parts ?? []).reduce((s, p: any) => s + Number(p.current_stock), 0);

  return (
    <div>
      <PageHeader
        title="Parts"
        subtitle={`${parts?.length ?? 0} parts · ${fmtNum(totalStock)} units total in stock`}
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Part</Button>}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4"><TableSkeleton /></div> : (parts ?? []).length === 0 ? (
            <EmptyState icon={Puzzle} title="No parts yet" description="Define the parts that make up your products." action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Part</Button>} />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow><TableHead></TableHead><TableHead>Name</TableHead><TableHead>Material</TableHead><TableHead>Consumption/unit</TableHead><TableHead className="w-52">Stock vs Threshold</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {parts?.map((p: any) => {
                  const pct = p.low_stock_threshold > 0 ? Math.min(100, (Number(p.current_stock) / Number(p.low_stock_threshold)) * 100) : 100;
                  const color = pct > 80 ? "bg-success" : pct > 40 ? "bg-warning" : "bg-destructive";
                  const isOpen = expanded === p.id;
                  return [
                    <TableRow key={p.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded(isOpen ? null : p.id)}>
                      <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-medium">{p.part_name}</TableCell>
                      <TableCell><MaterialBadge material={p.material_type} /></TableCell>
                      <TableCell>{fmtKg(p.consumption_per_unit_kg, 4)}</TableCell>
                      <TableCell>
                        <div className="text-xs mb-1">{fmtNum(p.current_stock)} / {fmtNum(p.low_stock_threshold)}</div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${Math.max(3, pct)}%` }} /></div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setProduce(p)}><Factory className="h-4 w-4" /> Produce</Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>,
                    isOpen ? <PartBatchesRow key={`${p.id}-batches`} partId={p.id} /> : null,
                  ];
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PartForm open={addOpen || !!editing} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditing(null); } }} part={editing} />
      <PartProduceDialog open={!!produce} onOpenChange={(o) => !o && setProduce(null)} part={produce} />
    </div>
  );
}

function PartBatchesRow({ partId }: { partId: string }) {
  const { data } = useQuery({
    queryKey: ["parts", partId, "batches"],
    queryFn: async () => (await supabase.from("part_batches").select("*, raw_materials(batch_number, vendors(name))").eq("part_id", partId).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <TableRow>
      <TableCell colSpan={6} className="bg-muted/20 p-4">
        {(data ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No batches yet.</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Qty</TableHead><TableHead>Raw material</TableHead><TableHead>Vendor</TableHead><TableHead>Date</TableHead><TableHead>Wastage</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.batch_number}</TableCell>
                  <TableCell>{fmtNum(b.quantity)}</TableCell>
                  <TableCell>{b.raw_materials?.batch_number}</TableCell>
                  <TableCell>{b.raw_materials?.vendors?.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(b.created_at)}</TableCell>
                  <TableCell>{fmtKg(b.wastage_kg)}</TableCell>
                  <TableCell className="text-xs">{wastageReasonLabel(b.wastage_reason)}</TableCell>
                  <TableCell>{b.is_blocked ? <Badge variant="destructive">Blocked</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCell>
    </TableRow>
  );
}

function PartForm({ open, onOpenChange, part }: { open: boolean; onOpenChange: (o: boolean) => void; part: any | null }) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { part_name: "", material_type: "PP", consumption_per_unit_kg: 0.01, low_stock_threshold: 100, notes: "" },
    values: part ? {
      part_name: part.part_name, material_type: part.material_type,
      consumption_per_unit_kg: Number(part.consumption_per_unit_kg),
      low_stock_threshold: Number(part.low_stock_threshold), notes: part.notes ?? "",
    } : undefined,
  });

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = { ...v, notes: v.notes || null };
      if (part) {
        const { error } = await supabase.from("parts").update(payload).eq("id", part.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("parts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(part ? "Part updated" : "Part added"); qc.invalidateQueries({ queryKey: ["parts"] }); audit(part ? "update" : "create", "part"); onOpenChange(false); form.reset(); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{part ? "Edit part" : "Add part"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div>
            <Label className="label-caps">Part name *</Label>
            <Input {...form.register("part_name")} className="mt-1" />
            {form.formState.errors.part_name && <p className="text-xs text-destructive mt-1">{form.formState.errors.part_name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="label-caps">Material *</Label>
              <Select value={form.watch("material_type")} onValueChange={(v) => form.setValue("material_type", v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{MATERIAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-caps">Consumption/unit (kg) *</Label>
              <Input type="number" step="0.0001" {...form.register("consumption_per_unit_kg")} className="mt-1" />
              {form.formState.errors.consumption_per_unit_kg && <p className="text-xs text-destructive mt-1">{form.formState.errors.consumption_per_unit_kg.message}</p>}
            </div>
          </div>
          <div>
            <Label className="label-caps">Low stock threshold</Label>
            <Input type="number" step="0.001" {...form.register("low_stock_threshold")} className="mt-1" />
          </div>
          <div>
            <Label className="label-caps">Notes</Label>
            <Textarea rows={2} {...form.register("notes")} className="mt-1" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
