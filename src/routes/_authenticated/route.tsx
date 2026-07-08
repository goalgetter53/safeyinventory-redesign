import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Package, Puzzle, Boxes, Factory, CalendarClock,
  GitBranch, BarChart3, Bell, ShieldAlert, Settings, LogOut, Menu, Search, X, Warehouse,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window !== "undefined" && (window as any).__TRACE_DEMO) {
      return { session: { user: { id: "demo", email: "demo@trace.os" } } } as any;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { session: data.session };
  },
  component: AuthenticatedLayout,
});

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; group: "ops" | "insight" | "system" };

const NAV: NavItem[] = [
  { to: "/",                    label: "Dashboard",          icon: LayoutDashboard, group: "ops" },
  { to: "/vendors",             label: "Vendors",            icon: Users,           group: "ops" },
  { to: "/raw-materials",       label: "Raw materials",      icon: Package,         group: "ops" },
  { to: "/parts",               label: "Parts",              icon: Puzzle,          group: "ops" },
  { to: "/products",            label: "Products",           icon: Boxes,           group: "ops" },
  { to: "/production",          label: "Production",         icon: Factory,         group: "ops" },
  { to: "/production-planning", label: "Production planning",icon: CalendarClock,   group: "insight" },
  { to: "/stock",               label: "Stock",              icon: Warehouse,       group: "insight" },
  { to: "/traceability",        label: "Traceability",       icon: GitBranch,       group: "insight" },
  { to: "/reports",             label: "Reports",            icon: BarChart3,       group: "insight" },
  { to: "/alerts",              label: "Alerts",             icon: Bell,            group: "insight" },
  { to: "/batch-recall",        label: "Batch recall",       icon: ShieldAlert,     group: "system" },
  { to: "/settings",            label: "Settings",           icon: Settings,        group: "system" },
];

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
      <aside className="hidden lg:flex w-[232px] flex-col bg-sidebar border-r border-sidebar-border sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[280px] bg-sidebar border-sidebar-border">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenu={() => setMobileOpen(true)} />
        {!online && (
          <div className="bg-warning text-warning-foreground text-[12px] text-center py-1.5">
            Connection lost — retrying
          </div>
        )}
        <main className="flex-1 w-full max-w-[1400px] mx-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const unread = useUnreadAlertsCount();

  const grouped = (["ops", "insight", "system"] as const).map((g) => ({
    group: g,
    items: NAV.filter((n) => n.group === g),
  }));

  return (
    <>
      {/* Brand row — standard, not editorial. */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
        <div className="h-7 w-7 rounded bg-primary text-primary-foreground flex items-center justify-center">
          <Factory className="h-3.5 w-3.5" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[13.5px] font-semibold tracking-[-0.005em]">Traceability</span>
          <span className="text-[10.5px] text-muted-foreground tracking-[0.04em] uppercase mt-0.5">v1.0</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <div className="px-2 mb-1 label-caps">
              {group === "ops" ? "Operations" : group === "insight" ? "Insight" : "System"}
            </div>
            <div className="space-y-px">
              {items.map((item) => {
                const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 px-2 h-8 rounded text-[13px] transition-colors",
                      active
                        ? "bg-sidebar-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60",
                    )}
                  >
                    <item.icon className="h-[14px] w-[14px] shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.to === "/alerts" && unread > 0 && (
                      <span className="num text-[10.5px] bg-foreground text-background px-1.5 h-[16px] inline-flex items-center rounded-sm font-medium">
                        {unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-sidebar-border flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">realtime</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
          <span className="text-[11px] text-muted-foreground">live</span>
        </span>
      </div>
    </>
  );
}

function useUnreadAlertsCount() {
  const { data } = useQuery({
    queryKey: ["alerts", "unread-count"],
    queryFn: async () => {
      if (typeof window !== "undefined" && (window as any).__TRACE_DEMO) return 3;
      const { count, error } = await supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
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

  const email = user?.email ?? "?";
  const handle = email.split("@")[0] ?? "user";

  return (
    <header className="h-14 border-b bg-card flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30">
      <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={onMenu}><Menu className="h-4 w-4" /></Button>
      <h1 className="text-[14px] font-semibold tracking-[-0.005em]">{title}</h1>
      <div className="flex-1 max-w-[480px] mx-auto">
        <GlobalSearch />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 pl-1 pr-2 h-8 rounded border border-border hover:bg-accent transition-colors">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-secondary text-foreground text-[10.5px] font-medium">
                {handle.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden md:inline text-[12.5px] truncate max-w-[120px]">{handle}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuLabel className="font-normal pb-1">
            <div className="label-caps mb-1">Signed in as</div>
            <div className="text-[13px] truncate font-medium">{email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-[13px]">Profile</DropdownMenuItem>
          <DropdownMenuItem disabled className="text-[13px]">Preferences</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-[13px] text-destructive focus:text-destructive">
            <LogOut className="h-3.5 w-3.5" /> Sign out
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
  const debouncedQ = useDebouncedValue(q, 300);

  const { data } = useQuery({
    queryKey: ["global-search", debouncedQ],
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      if (typeof window !== "undefined" && (window as any).__TRACE_DEMO) {
        return { vendors: [], raw_materials: [], parts: [], products: [] };
      }
      const [v, r, p, pr] = await Promise.all([
        supabase.from("vendors").select("id,name").ilike("name", `%${debouncedQ}%`).limit(5),
        supabase.from("raw_materials").select("id,batch_number,material_type").ilike("batch_number", `%${debouncedQ}%`).limit(5),
        supabase.from("parts").select("id,part_name").ilike("part_name", `%${debouncedQ}%`).limit(5),
        supabase.from("products").select("id,product_name,product_code").or(`product_name.ilike.%${debouncedQ}%,product_code.ilike.%${debouncedQ}%`).limit(5),
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
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input
        placeholder="Search vendors, batches, parts, products…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="pl-8 h-8 text-[13px] bg-secondary border-border"
      />
      {q && (
        <button onClick={() => { setQ(""); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && q.length >= 2 && (
        <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded shadow-md z-50 max-h-96 overflow-y-auto">
          {!hasResults && <div className="p-3 text-[12.5px] text-muted-foreground text-center">No results for "{debouncedQ}"</div>}
          {data && Object.entries({
            Vendors: data.vendors.map((v) => ({ key: v.id, label: v.name, sub: "vendor", to: "/vendors" as const })),
            "Raw materials": data.raw_materials.map((r) => ({ key: r.id, label: r.batch_number, sub: r.material_type, to: "/raw-materials" as const })),
            Parts: data.parts.map((p) => ({ key: p.id, label: p.part_name, sub: "part", to: "/parts" as const })),
            Products: data.products.map((p) => ({ key: p.id, label: p.product_name, sub: p.product_code, to: "/products" as const })),
          }).map(([group, items]) => items.length > 0 && (
            <div key={group}>
              <div className="px-3 py-1.5 label-caps bg-muted">{group}</div>
              {items.map((it) => (
                <button
                  key={it.key}
                  onMouseDown={() => { navigate({ to: it.to }); setOpen(false); setQ(""); }}
                  className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent flex items-baseline gap-2"
                >
                  <span className="font-medium truncate">{it.label}</span>
                  {it.sub && <span className="text-[11px] text-muted-foreground ml-auto">{it.sub}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
