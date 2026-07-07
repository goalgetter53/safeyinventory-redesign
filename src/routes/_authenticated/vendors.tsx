import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Users, Search, Pencil, Trash2, Eye, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PageHeader } from "@/components/inventory/page-header";
import { EmptyState } from "@/components/inventory/empty-state";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { TableSkeleton } from "@/components/inventory/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATERIAL_TYPES, fmtDate } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: VendorsPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  phone: z.string().trim().min(6, "Required").max(30),
  address: z.string().trim().min(1, "Required").max(500),
  materials_supplied: z.array(z.string()).min(1, "Pick at least one material"),
  notes: z.string().max(1000).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function VendorsPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [material, setMaterial] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const qc = useQueryClient();

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["vendors"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: partCounts } = useQuery({
    queryKey: ["vendors", "part-counts"],
    queryFn: async () => {
      // count distinct parts per vendor via raw_materials → part_batches
      const { data, error } = await supabase.from("raw_materials").select("vendor_id, part_batches(part_id)");
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      (data ?? []).forEach((r: any) => {
        const set = map.get(r.vendor_id) ?? new Set<string>();
        (r.part_batches ?? []).forEach((pb: any) => set.add(pb.part_id));
        map.set(r.vendor_id, set);
      });
      const out: Record<string, number> = {};
      map.forEach((s, k) => { out[k] = s.size; });
      return out;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vendor deleted"); qc.invalidateQueries({ queryKey: ["vendors"] }); audit("delete", "vendor"); setDeleting(null); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("vendors").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });

  const filtered = (vendors ?? []).filter((v) => {
    const term = debouncedQ.toLowerCase();
    const matchQ = !term || [v.name, v.phone, ...(v.materials_supplied ?? [])].some((f) => String(f).toLowerCase().includes(term));
    const matchM = material === "all" || (v.materials_supplied ?? []).includes(material);
    return matchQ && matchM;
  });

  return (
    <div>
      <PageHeader
        title="Vendor Management"
        subtitle="Manage your raw material suppliers"
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Vendor</Button>}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, phone, material…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={material} onValueChange={setMaterial}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All materials</SelectItem>
            {MATERIAL_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4"><TableSkeleton /></div> : filtered.length === 0 ? (
            <EmptyState icon={Users} title="No vendors yet" description="Add your first supplier to start tracking raw material sources." action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Vendor</Button>} />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Materials</TableHead>
                  <TableHead>Parts</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.phone}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{v.address}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{(v.materials_supplied ?? []).map((m: string) => <MaterialBadge key={m} material={m} />)}</div></TableCell>
                    <TableCell>{partCounts?.[v.id] ?? 0}</TableCell>
                    <TableCell><Switch checked={v.is_active} onCheckedChange={(c) => toggleActive.mutate({ id: v.id, is_active: c })} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setViewing(v)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(v)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(v)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <VendorForm open={addOpen || !!editing} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditing(null); } }} vendor={editing} />
      <VendorView open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} vendor={viewing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleting?.name}. Raw material batches linked to this vendor will block deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate(deleting.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VendorForm({ open, onOpenChange, vendor }: { open: boolean; onOpenChange: (o: boolean) => void; vendor: any | null }) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", address: "", materials_supplied: [], notes: "" },
    values: vendor ? {
      name: vendor.name, phone: vendor.phone, address: vendor.address,
      materials_supplied: vendor.materials_supplied ?? [], notes: vendor.notes ?? "",
    } : undefined,
  });

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = { ...v, notes: v.notes || null };
      if (vendor) {
        const { error } = await supabase.from("vendors").update(payload).eq("id", vendor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vendors").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(vendor ? "Vendor updated" : "Vendor added");
      qc.invalidateQueries({ queryKey: ["vendors"] });
      audit(vendor ? "update" : "create", "vendor");
      onOpenChange(false);
      form.reset();
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const mats = form.watch("materials_supplied") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{vendor ? "Edit vendor" : "Add vendor"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div>
            <Label className="label-caps">Name *</Label>
            <Input {...form.register("name")} className="mt-1" />
            {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
          </div>
          <div>
            <Label className="label-caps">Phone *</Label>
            <Input {...form.register("phone")} className="mt-1" />
            {form.formState.errors.phone && <p className="text-xs text-destructive mt-1">{form.formState.errors.phone.message}</p>}
          </div>
          <div>
            <Label className="label-caps">Address *</Label>
            <Textarea rows={3} {...form.register("address")} className="mt-1" />
            {form.formState.errors.address && <p className="text-xs text-destructive mt-1">{form.formState.errors.address.message}</p>}
          </div>
          <div>
            <Label className="label-caps">Materials supplied *</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {MATERIAL_TYPES.map((m) => (
                <label key={m} className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent">
                  <Checkbox
                    checked={mats.includes(m)}
                    onCheckedChange={(c) => form.setValue("materials_supplied", c ? [...mats, m] : mats.filter((x) => x !== m), { shouldValidate: true })}
                  />
                  <MaterialBadge material={m} />
                </label>
              ))}
            </div>
            {form.formState.errors.materials_supplied && <p className="text-xs text-destructive mt-1">{form.formState.errors.materials_supplied.message}</p>}
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

function VendorView({ open, onOpenChange, vendor }: { open: boolean; onOpenChange: (o: boolean) => void; vendor: any | null }) {
  const { data: batches } = useQuery({
    queryKey: ["vendors", vendor?.id, "batches"],
    enabled: !!vendor,
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("id,batch_number,material_type,initial_quantity_kg,purchase_date").eq("vendor_id", vendor.id).order("purchase_date", { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });
  if (!vendor) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{vendor.name}</DialogTitle></DialogHeader>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div><div className="label-caps">Phone</div><div className="text-sm">{vendor.phone}</div></div>
            <div><div className="label-caps">Address</div><div className="text-sm">{vendor.address}</div></div>
            <div>
              <div className="label-caps">Materials</div>
              <div className="flex flex-wrap gap-1 mt-1">{(vendor.materials_supplied ?? []).map((m: string) => <MaterialBadge key={m} material={m} />)}</div>
            </div>
            {vendor.notes && <div><div className="label-caps">Notes</div><div className="text-sm">{vendor.notes}</div></div>}
          </div>
          <div>
            <div className="label-caps mb-2">Recent raw material batches</div>
            {(batches ?? []).length === 0 ? <div className="text-sm text-muted-foreground">No batches yet.</div> : (
              <Table>
                <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Material</TableHead><TableHead>Qty</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {batches?.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.batch_number}</TableCell>
                      <TableCell><MaterialBadge material={b.material_type} /></TableCell>
                      <TableCell>{Number(b.initial_quantity_kg)} kg</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(b.purchase_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
