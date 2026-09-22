import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";
import {
  Compass,
  FileText,
  FolderPlus,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects?: Array<{ id: string; name: string }>;
}

export function CommandPalette({
  open,
  onOpenChange,
  projects = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  // Keyboard shortcut listener for ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = (action: () => void | Promise<unknown>) => {
    void action();
    onOpenChange(false);
    setQuery("");
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 bg-background/80 backdrop-blur-md"
          />

          {/* Dialog Body */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl shadow-black/20"
          >
            {/* Search Input Bar */}
            <div className="flex h-13 items-center gap-3 border-b border-border/70 px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, assessments, or actions…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="rounded border border-border/80 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  ESC
                </kbd>
              )}
            </div>

            {/* Results list */}
            <div className="max-h-80 overflow-y-auto p-2 text-sm">
              {/* Quick Actions */}
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Navigation
              </div>

              <button
                type="button"
                onClick={() => handleSelect(() => navigate("/workspace"))}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              >
                <FolderPlus className="size-4 text-primary" />
                <span className="flex-1">Open workspace</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  ↵
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelect(() => navigate("/"))}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              >
                <Compass className="size-4 text-primary" />
                <span className="flex-1">Landing Page</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSelect(() =>
                    setTheme(theme === "dark" ? "light" : "dark"),
                  )
                }
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
              >
                {theme === "dark" ? (
                  <Sun className="size-4 text-amber-500" />
                ) : (
                  <Moon className="size-4 text-indigo-400" />
                )}
                <span className="flex-1">Toggle Dark / Light Mode</span>
              </button>

              {/* Projects List if any */}
              {filteredProjects.length > 0 ? (
                <>
                  <div className="mt-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Projects ({filteredProjects.length})
                  </div>
                  {filteredProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        handleSelect(() => navigate(`/projects/${p.id}`))
                      }
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                    >
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate font-medium text-foreground">
                        {p.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Open
                      </span>
                    </button>
                  ))}
                </>
              ) : query ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No matching projects found for "{query}".
                </div>
              ) : null}
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
              <span>Navigate with cursor or keys</span>
              <span className="font-mono">ValueIQ Quick Jump</span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
