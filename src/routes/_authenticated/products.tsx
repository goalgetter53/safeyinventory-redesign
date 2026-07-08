import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Boxes, Loader2, ListTree } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { EmptyState } from "@/components/inventory/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

const schema = z.object({
  product_name: z.string().trim().min(1),
  product_code: z.string().trim().min(1),
  description: z.string().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function ProductsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const qc = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*, product_bom(quantity_required, parts(part_name))").order("product_name")).data ?? [],
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("products").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products?.length ?? 0} products`}
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Product</Button>}
      />

      {isLoading ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div> :
        (products ?? []).length === 0 ? <Card><CardContent><EmptyState icon={Boxes} title="No products yet" description="Add your first finished product and its bill of materials." action={<Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Product</Button>} /></CardContent></Card> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products?.map((p: any) => {
            const totalParts = (p.product_bom ?? []).reduce((s: number, b: any) => s + Number(b.quantity_required), 0);
            return (
              <Card key={p.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{p.product_name}</div>
                      <div className="text-xs text-muted-foreground">{p.product_code}</div>
                    </div>
                    <Switch checked={p.is_active} onCheckedChange={(c) => toggleActive.mutate({ id: p.id, is_active: c })} />
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{p.description}</p>}
                  <div className="mt-3 text-xs text-muted-foreground">
                    {(p.product_bom ?? []).length} parts · {totalParts} pieces per unit
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm"><Link to="/products-bom/$id" params={{ id: p.id }}><ListTree className="h-4 w-4" /> Edit BOM</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      }

      <ProductForm open={addOpen || !!editing} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditing(null); } }} product={editing} />
    </div>
  );
}

function ProductForm({ open, onOpenChange, product }: { open: boolean; onOpenChange: (o: boolean) => void; product: any | null }) {
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { product_name: "", product_code: "", description: "" },
    values: product ? { product_name: product.product_name, product_code: product.product_code ?? "", description: product.description ?? "" } : undefined,
  });
  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const payload = { ...v, description: v.description || null };
      if (product) { const { error } = await supabase.from("products").update(payload).eq("id", product.id); if (error) throw error; }
      else { const { error } = await supabase.from("products").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(product ? "Product updated" : "Product added"); qc.invalidateQueries({ queryKey: ["products"] }); audit(product ? "update" : "create", "product"); onOpenChange(false); form.reset(); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div><Label className="label-caps">Name *</Label><Input {...form.register("product_name")} className="mt-1" /></div>
          <div><Label className="label-caps">Product code *</Label><Input {...form.register("product_code")} className="mt-1" /></div>
          <div><Label className="label-caps">Description</Label><Textarea rows={3} {...form.register("description")} className="mt-1" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
