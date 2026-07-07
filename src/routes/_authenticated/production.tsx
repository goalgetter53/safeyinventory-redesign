import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Factory, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { EmptyState } from "@/components/inventory/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtNum, fmtKg } from "@/lib/inventory/format";

export const Route = createFileRoute("/_authenticated/production")({
  component: ProductionPage,
});

function ProductionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["production_batches"],
    queryFn: async () => (await supabase.from("production_batches").select("*, products(product_name)").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle="Record finished product manufacturing"
        actions={
          <>
            <Button asChild variant="outline"><Link to="/production-planning"><CalendarClock className="h-4 w-4" /> Plan Production</Link></Button>
            <Button asChild><Link to="/production/new"><Plus className="h-4 w-4" /> Start Production</Link></Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div> :
            (data ?? []).length === 0 ? (
              <EmptyState icon={Factory} title="No production runs yet" description="Start your first production batch." action={<Button asChild><Link to="/production/new"><Plus className="h-4 w-4" /> Start Production</Link></Button>} />
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow><TableHead>Batch</TableHead><TableHead>Product</TableHead><TableHead>Quantity</TableHead><TableHead>Expected kg</TableHead><TableHead>Actual kg</TableHead><TableHead>Wastage %</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((r: any) => {
                    const pct = Number(r.expected_raw_material_kg) > 0 ? (Number(r.wastage_kg) / Number(r.expected_raw_material_kg)) * 100 : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.batch_number}</TableCell>
                        <TableCell>{r.products?.product_name}</TableCell>
                        <TableCell>{fmtNum(r.quantity_produced)}</TableCell>
                        <TableCell>{fmtKg(r.expected_raw_material_kg)}</TableCell>
                        <TableCell>{fmtKg(r.actual_raw_material_kg)}</TableCell>
                        <TableCell className={pct > 10 ? "text-destructive font-medium" : ""}>{pct.toFixed(2)}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.production_date)}</TableCell>
                        <TableCell><Badge variant={r.status === "recalled" ? "destructive" : r.status === "completed" ? "secondary" : "default"}>{r.status}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          }
        </CardContent>
      </Card>
    </div>
  );
}
