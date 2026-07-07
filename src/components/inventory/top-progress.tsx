import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Slim top-of-page progress bar that appears whenever the router is navigating. */
export function TopProgress() {
  const isLoading = useRouterState({ select: (s) => s.isLoading || s.status === "pending" });
  return (
    <div
      aria-hidden
      className={cn(
        "fixed top-0 left-0 right-0 z-[60] h-0.5 pointer-events-none transition-opacity duration-200",
        isLoading ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "h-full bg-primary origin-left",
          isLoading ? "animate-[topbar_1.1s_ease-in-out_infinite]" : "",
        )}
        style={{ width: "40%" }}
      />
      <style>{`
        @keyframes topbar {
          0% { transform: translateX(-100%) scaleX(0.6); }
          50% { transform: translateX(60%) scaleX(1); }
          100% { transform: translateX(260%) scaleX(0.6); }
        }
      `}</style>
    </div>
  );
}
