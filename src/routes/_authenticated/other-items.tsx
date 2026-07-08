import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { EmptyState } from "@/components/inventory/empty-state";
import { TableSkeleton } from "@/components/inventory/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtNum } from "@/lib/inventory/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/other-items")({
  component: OtherItemsPage,
});

type Item = {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  low_stock_threshold: number;
  notes: string | null;
};

const EMPTY_FORM = { name: "", category: "", unit: "pcs", current_stock: 0, low_stock_threshold: 0, notes: "" };

function OtherItemsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data, isLoading } = useQuery({
    queryKey: ["other-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("other_items")
        .select("id,name,category,unit,current_stock,low_stock_threshold,notes")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: typeof form & { id?: string }) => {
      if (payload.id) {
        const { error } = await supabase.from("other_items").update({
          name: payload.name,
          category: payload.category,
          unit: payload.unit,
          current_stock: Number(payload.current_stock),
          low_stock_threshold: Number(payload.low_stock_threshold),
          notes: payload.notes || null,
        }).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("other_items").insert({
          name: payload.name,
          category: payload.category,
          unit: payload.unit,
          current_stock: Number(payload.current_stock),
          low_stock_threshold: Number(payload.low_stock_threshold),
          notes: payload.notes || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["other-items"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success(editing ? "Item updated" : "Item added");
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("other_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["other-items"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      toast.success("Item deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      current_stock: item.current_stock,
      low_stock_threshold: item.low_stock_threshold,
      notes: item.notes ?? "",
    });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
  }

  const categories = Array.from(new Set((data ?? []).map((d) => d.category))).sort();
  const lowCount = (data ?? []).filter((d) => d.current_stock < d.low_stock_threshold).length;

  return (
    <div>
      <PageHeader
        title="Other items"
        subtitle={`${fmtNum(data?.length ?? 0)} items · ${categories.length} categories · ${lowCount} low-stock`}
        actions={
          <Button onClick={openCreate} size="sm" className="h-8">
            <Plus className="h-3.5 w-3.5" /> Add item
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><TableSkeleton /></div>
          ) : (data ?? []).length === 0 ? (
            <EmptyState
              icon={Archive}
              title="No other items yet"
              description="Track standalone inventory like boxes, tapes, and consumables. No production link — stock and low-stock alerts only."
              action={<Button onClick={openCreate} size="sm"><Plus className="h-3.5 w-3.5" /> Add first item</Button>}
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.map((it) => {
                  const low = it.current_stock < it.low_stock_threshold;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{it.name}</div>
                        {it.notes && <div className="text-[11px] text-muted-foreground">{it.notes}</div>}
                      </TableCell>
                      <TableCell className="text-[12.5px]">{it.category}</TableCell>
                      <TableCell className={cn("text-right num", low && "text-warning font-medium")}>{fmtNum(it.current_stock)}</TableCell>
                      <TableCell className="text-right num text-xs text-muted-foreground">{fmtNum(it.low_stock_threshold)}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{it.unit}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(it)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(`Delete "${it.name}"?`)) remove.mutate(it.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); upsert.mutate({ ...form, id: editing?.id }); }}
            className="space-y-3"
          >
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-9" />
            </Field>
            <Field label="Category" required hint="e.g. Packaging, Consumables, Tools">
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required className="h-9" list="other-categories" />
              <datalist id="other-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Unit">
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="h-9" placeholder="pcs, m, kg…" />
              </Field>
              <Field label="Stock">
                <Input type="number" step="any" min="0" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: Number(e.target.value) })} className="h-9" />
              </Field>
              <Field label="Threshold">
                <Input type="number" step="any" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} className="h-9" />
              </Field>
            </div>
            <Field label="Notes">
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-9" />
            </Field>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={closeDialog}><X className="h-3.5 w-3.5" /> Cancel</Button>
              <Button type="submit" disabled={upsert.isPending}><Save className="h-3.5 w-3.5" /> {editing ? "Update" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="label-caps">
        {label}{required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}