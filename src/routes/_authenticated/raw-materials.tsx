import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Package, Eye, Ban, CheckCircle, Loader2, Filter } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { MATERIAL_TYPES, fmtCurrency, fmtDate, fmtKg, wastageReasonLabel } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/raw-materials")({
  component: RawMaterialsPage,
});

const schema = z.object({
  material_type: z.enum(["PC", "POM", "PP", "TPE"]),
  vendor_id: z.string().uuid("Pick a vendor"),
  initial_quantity_kg: z.coerce.number().positive("Must be > 0"),
  rate_per_kg: z.coerce.number().min(0, "Must be ≥ 0"),
  purchase_date: z.string().min(1, "Required"),
  notes: z.string().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function RawMaterialsPage() {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("all");
  const [showBlocked, setShowBlocked] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  const { data: vendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => (await supabase.from("vendors").select("id,name,materials_supplied").order("name")).data ?? [],
  });

  const { data: materials, isLoading } = useQuery({
    queryKey: ["raw_materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*, vendors(name)").order("purchase_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const qc = useQueryClient();
  const block = useMutation({
    mutationFn: async ({ id, is_blocked }: { id: string; is_blocked: boolean }) => {
      const { error } = await supabase.from("raw_materials").update({ is_blocked }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => { toast[v.is_blocked ? "warning" : "success"](v.is_blocked ? "Batch blocked — cascade applied" : "Batch unblocked"); qc.invalidateQueries({ queryKey: ["raw_materials"] }); qc.invalidateQueries({ queryKey: ["alerts", "unread-count"] }); audit(v.is_blocked ? "block" : "unblock", "raw_material", v.id); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const filtered = (materials ?? []).filter((r: any) => {
    if (filterType !== "all" && r.material_type !== filterType) return false;
    if (filterVendor !== "all" && r.vendor_id !== filterVendor) return false;
    if (!showBlocked && r.is_blocked) return false;
    return true;
  });

  const activeTotal = filtered.reduce((s, r: any) => s + Number(r.remaining_quantity_kg), 0);
  const valueTotal = filtered.reduce((s, r: any) => s + Number(r.remaining_quantity_kg) * Number(r.rate_per_kg), 0);

  return (
    <div>
      <PageHeader
        title="Raw Materials"
        subtitle={`${fmtKg(activeTotal)} in stock · ${fmtCurrency(valueTotal)} inventory value`}
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Raw Material</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Filters:</span></div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All materials</SelectItem>
            {MATERIAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterVendor} onValueChange={setFilterVendor}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {(vendors ?? []).map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm"><Switch checked={showBlocked} onCheckedChange={setShowBlocked} /> Show blocked</label>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4"><TableSkeleton /></div> : filtered.length === 0 ? (
            <EmptyState icon={Package} title="No raw material batches" description="Add your first raw material purchase." action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Raw Material</Button>} />
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Initial</TableHead>
                  <TableHead className="w-52">Remaining</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => {
                  const pct = (Number(r.remaining_quantity_kg) / Number(r.initial_quantity_kg)) * 100;
                  const color = pct > 50 ? "bg-success" : pct > 20 ? "bg-warning" : "bg-destructive";
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{r.batch_number}</TableCell>
                      <TableCell><MaterialBadge material={r.material_type} /></TableCell>
                      <TableCell>{r.vendors?.name}</TableCell>
                      <TableCell>{fmtKg(r.initial_quantity_kg)}</TableCell>
                      <TableCell>
                        <div className="text-xs mb-1">{fmtKg(r.remaining_quantity_kg)}</div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
                      </TableCell>
                      <TableCell>{fmtCurrency(r.rate_per_kg)}/kg</TableCell>
                      <TableCell>{fmtCurrency(r.total_cost)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(r.purchase_date)}</TableCell>
                      <TableCell>{r.is_blocked ? <Badge variant="destructive">Blocked</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => block.mutate({ id: r.id, is_blocked: !r.is_blocked })}>
                          {r.is_blocked ? <CheckCircle className="h-4 w-4 text-success" /> : <Ban className="h-4 w-4 text-destructive" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddRawMaterialDialog open={addOpen} onOpenChange={setAddOpen} vendors={vendors ?? []} />
      <ViewRawMaterialDialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} material={viewing} />
    </div>
  );
}

function AddRawMaterialDialog({ open, onOpenChange, vendors }: { open: boolean; onOpenChange: (o: boolean) => void; vendors: any[] }) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { material_type: "PP", vendor_id: "", initial_quantity_kg: 0, rate_per_kg: 0, purchase_date: new Date().toISOString().slice(0, 10), notes: "" },
  });
  const mt = form.watch("material_type");
  const availableVendors = vendors.filter((v) => (v.materials_supplied ?? []).includes(mt));

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const { data, error } = await supabase.from("raw_materials").insert({
        material_type: v.material_type,
        vendor_id: v.vendor_id,
        initial_quantity_kg: v.initial_quantity_kg,
        remaining_quantity_kg: v.initial_quantity_kg,
        rate_per_kg: v.rate_per_kg,
        purchase_date: v.purchase_date,
        notes: v.notes || null,
      }).select("batch_number").single();
      if (error) throw error;
      return data.batch_number;
    },
    onSuccess: (batch) => { toast.success(`Raw material added: ${batch}`); qc.invalidateQueries({ queryKey: ["raw_materials"] }); audit("create", "raw_material", batch); onOpenChange(false); form.reset(); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Raw Material Batch</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="label-caps">Material *</Label>
              <Select value={mt} onValueChange={(v) => { form.setValue("material_type", v as any); form.setValue("vendor_id", ""); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{MATERIAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-caps">Vendor *</Label>
              <Select value={form.watch("vendor_id")} onValueChange={(v) => form.setValue("vendor_id", v, { shouldValidate: true })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose vendor" /></SelectTrigger>
                <SelectContent>
                  {availableVendors.length === 0 ? <div className="p-2 text-sm text-muted-foreground">No vendor supplies {mt}</div> :
                    availableVendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.formState.errors.vendor_id && <p className="text-xs text-destructive mt-1">{form.formState.errors.vendor_id.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="label-caps">Quantity (kg) *</Label>
              <Input type="number" step="0.001" {...form.register("initial_quantity_kg")} className="mt-1" />
              {form.formState.errors.initial_quantity_kg && <p className="text-xs text-destructive mt-1">{form.formState.errors.initial_quantity_kg.message}</p>}
            </div>
            <div>
              <Label className="label-caps">Rate (₹/kg) *</Label>
              <Input type="number" step="0.01" {...form.register("rate_per_kg")} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="label-caps">Purchase date *</Label>
            <Input type="date" {...form.register("purchase_date")} className="mt-1" />
          </div>
          <div>
            <Label className="label-caps">Batch number</Label>
            <Input disabled placeholder={`Auto-generated (e.g. ${mt}-003)`} className="mt-1" />
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

function ViewRawMaterialDialog({ open, onOpenChange, material }: { open: boolean; onOpenChange: (o: boolean) => void; material: any | null }) {
  const { data } = useQuery({
    queryKey: ["raw_materials", material?.id, "details"],
    enabled: !!material,
    queryFn: async () => {
      const [pb, wl] = await Promise.all([
        supabase.from("part_batches").select("*, parts(part_name), production_batch_parts(production_batches(id,batch_number,products(product_name),quantity_produced,production_date))").eq("raw_material_batch_id", material.id),
        supabase.from("wastage_logs").select("*").eq("level", "part"),
      ]);
      return { part_batches: pb.data ?? [], wastage: wl.data ?? [] };
    },
  });
  if (!material) return null;

  const pct = (Number(material.remaining_quantity_kg) / Number(material.initial_quantity_kg)) * 100;
  const utilization = 100 - pct;
  const ageDays = Math.floor((Date.now() - new Date(material.purchase_date).getTime()) / (1000 * 60 * 60 * 24));
  const partWaste = (data?.part_batches ?? []).reduce((s: number, pb: any) => s + Number(pb.wastage_kg), 0);

  const forward = new Map<string, any>();
  (data?.part_batches ?? []).forEach((pb: any) => (pb.production_batch_parts ?? []).forEach((pbp: any) => forward.set(pbp.production_batches?.id, pbp.production_batches)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{material.batch_number} <MaterialBadge material={material.material_type} /></DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <Stat label="Initial" value={fmtKg(material.initial_quantity_kg)} />
          <Stat label="Remaining" value={fmtKg(material.remaining_quantity_kg)} />
          <Stat label="Utilization" value={`${utilization.toFixed(1)}%`} />
          <Stat label="Rate" value={`${fmtCurrency(material.rate_per_kg)}/kg`} />
          <Stat label="Value" value={fmtCurrency(material.total_cost)} />
          <Stat label="Age" value={`${ageDays}d`} />
        </div>
        <Progress value={pct} className="mb-4" />
        <Tabs defaultValue="usage">
          <TabsList><TabsTrigger value="usage">Usage</TabsTrigger><TabsTrigger value="forward">Trace Forward</TabsTrigger><TabsTrigger value="waste">Wastage</TabsTrigger></TabsList>
          <TabsContent value="usage">
            {(data?.part_batches ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No usage yet.</p> :
              <Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Part</TableHead><TableHead>Qty</TableHead><TableHead>Actual kg</TableHead><TableHead>Wastage</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                <TableBody>{data?.part_batches.map((pb: any) => (
                  <TableRow key={pb.id}><TableCell className="font-medium">{pb.batch_number}</TableCell><TableCell>{pb.parts?.part_name}</TableCell><TableCell>{pb.quantity}</TableCell><TableCell>{fmtKg(pb.actual_usage_kg)}</TableCell><TableCell>{fmtKg(pb.wastage_kg)}</TableCell><TableCell className="text-xs">{wastageReasonLabel(pb.wastage_reason)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>}
          </TabsContent>
          <TabsContent value="forward">
            {forward.size === 0 ? <p className="text-sm text-muted-foreground">Not yet consumed in production.</p> :
              <Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>{Array.from(forward.values()).filter(Boolean).map((p: any) => (
                  <TableRow key={p.id}><TableCell className="font-medium">{p.batch_number}</TableCell><TableCell>{p.products?.product_name}</TableCell><TableCell>{p.quantity_produced}</TableCell><TableCell>{fmtDate(p.production_date)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>}
          </TabsContent>
          <TabsContent value="waste">
            <div className="p-4 border rounded-md">
              <div className="label-caps">Total wastage attributed</div>
              <div className="text-2xl font-bold mt-1">{fmtKg(partWaste)}</div>
              <div className="text-xs text-muted-foreground mt-1">Sum across all part batches produced from this raw material.</div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border rounded-md p-2"><div className="label-caps">{label}</div><div className="text-sm font-semibold mt-0.5">{value}</div></div>;
}
