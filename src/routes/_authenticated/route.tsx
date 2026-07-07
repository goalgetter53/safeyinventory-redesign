import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Package, Puzzle, Boxes, Factory, CalendarClock,
  GitBranch, BarChart3, Bell, ShieldAlert, Settings, LogOut, Menu, Search, X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { session: data.session };
  },
  component: AuthenticatedLayout,
});

const NAV = [
  { to: "/",                   label: "Dashboard",           icon: LayoutDashboard },
  { to: "/vendors",            label: "Vendors",             icon: Users },
  { to: "/raw-materials",      label: "Raw Materials",       icon: Package },
  { to: "/parts",              label: "Parts",               icon: Puzzle },
  { to: "/products",           label: "Products",            icon: Boxes },
  { to: "/production",         label: "Production",          icon: Factory },
  { to: "/production-planning",label: "Production Planning", icon: CalendarClock },
  { to: "/traceability",       label: "Traceability",        icon: GitBranch },
  { to: "/reports",            label: "Reports",             icon: BarChart3 },
  { to: "/alerts",             label: "Alerts",              icon: Bell },
  { to: "/batch-recall",       label: "Batch Recall",        icon: ShieldAlert },
  { to: "/settings",           label: "Settings",            icon: Settings },
] as const;

function AuthenticatedLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex w-[240px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[280px] bg-sidebar text-sidebar-foreground border-sidebar-border">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenu={() => setMobileOpen(true)} />
        {!online && (
          <div className="bg-warning text-warning-foreground text-sm text-center py-2">
            Connection lost — retrying…
          </div>
        )}
        <main className="flex-1 max-w-[1440px] w-full mx-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadAlertsCount();

  return (
    <>
      <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="rounded-lg bg-primary p-2"><Factory className="h-5 w-5 text-primary-foreground" /></div>
        <div className="font-semibold text-sm">Traceability OS</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {NAV.map((item) => {
          const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/alerts" && unread > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{unread}</Badge>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-[11px] text-sidebar-foreground/60 border-t border-sidebar-border">
        v1.0 · Realtime enabled
      </div>
    </>
  );
}

function useUnreadAlertsCount() {
  const { data } = useQuery({
    queryKey: ["alerts", "unread-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
  useEffect(() => {
    const ch = supabase.channel("alerts-count").on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => {
      // realtime hint — react-query will refetch on interval
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  return data ?? 0;
}

function Header({ onMenu }: { onMenu: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const navigate = useNavigate();
  const title = NAV.find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to)))?.label ?? "Dashboard";

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="h-16 border-b bg-card flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}><Menu className="h-5 w-5" /></Button>
      <div className="hidden md:block font-semibold text-base">{title}</div>
      <div className="flex-1 max-w-xl mx-auto">
        <GlobalSearch />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8"><AvatarFallback>{initials}</AvatarFallback></Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="text-xs text-muted-foreground">Signed in as</div>
            <div className="text-sm truncate">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Profile (coming soon)</DropdownMenuItem>
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["global-search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const [v, r, p, pr] = await Promise.all([
        supabase.from("vendors").select("id,name").ilike("name", `%${q}%`).limit(5),
        supabase.from("raw_materials").select("id,batch_number,material_type").ilike("batch_number", `%${q}%`).limit(5),
        supabase.from("parts").select("id,part_name").ilike("part_name", `%${q}%`).limit(5),
        supabase.from("products").select("id,product_name,product_code").or(`product_name.ilike.%${q}%,product_code.ilike.%${q}%`).limit(5),
      ]);
      return {
        vendors: v.data ?? [],
        raw_materials: r.data ?? [],
        parts: p.data ?? [],
        products: pr.data ?? [],
      };
    },
  });

  const hasResults = data && (data.vendors.length + data.raw_materials.length + data.parts.length + data.products.length) > 0;

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search vendors, batches, parts, products…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="pl-9 h-9 bg-background"
      />
      {q && (
        <button onClick={() => { setQ(""); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
      {open && q.length >= 2 && (
        <div className="absolute top-full mt-1 w-full bg-popover border rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
          {!hasResults && <div className="p-4 text-sm text-muted-foreground text-center">No results</div>}
          {data && Object.entries({
            Vendors: data.vendors.map((v) => ({ key: v.id, label: v.name, to: "/vendors" as const })),
            "Raw Materials": data.raw_materials.map((r) => ({ key: r.id, label: `${r.batch_number} · ${r.material_type}`, to: "/raw-materials" as const })),
            Parts: data.parts.map((p) => ({ key: p.id, label: p.part_name, to: "/parts" as const })),
            Products: data.products.map((p) => ({ key: p.id, label: `${p.product_name}${p.product_code ? " · " + p.product_code : ""}`, to: "/products" as const })),
          }).map(([group, items]) => items.length > 0 && (
            <div key={group}>
              <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/50">{group}</div>
              {items.map((it) => (
                <button
                  key={it.key}
                  onMouseDown={() => { navigate({ to: it.to }); setOpen(false); setQ(""); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                >
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
