"use client";

import {
  Bot,
  ChevronDown,
  Clock3,
  CornerDownLeft,
  ExternalLink,
  FileCode,
  FileText,
  Folder,
  FolderKanban,
  FolderOpen,
  MessageSquarePlus,
  PanelLeft,
  Paperclip,
  Search,
  Terminal,
  User,
  WandSparkles,
  X,
} from "lucide-react";
import { useReducedMotion, motion } from "motion/react";
import { Link } from "react-router";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarInset,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  AnimatedSidebarRail,
  AnimatedSidebarTrigger,
} from "@/components/motion/animated-sidebar";
import { ChatApp } from "@/components/agents/chat-app";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

// Types
export interface SidebarResource {
  id: string;
  label: string;
  kind: "folder" | "project" | "file" | "bookmark";
  children?: SidebarResource[];
}

export type ToolApprovalStatus =
  | "pending"
  | "approving"
  | "approved"
  | "running"
  | "complete"
  | "denied"
  | "error";

export type ApprovalCardStatus = "pending" | "submitting" | "answered";

export interface ApprovalCardQuestion {
  id: string;
  title: string;
  options: { value: string; label: string }[];
  allowCustom?: boolean;
  customPlaceholder?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  status: "completed" | "in-progress" | "pending" | "cancelled";
}

interface AddedMessage {
  id: string;
  from: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const resources: SidebarResource[] = [
  {
    id: "release",
    label: "Release workspace",
    kind: "project",
    children: [
      { id: "checkout", label: "Checkout audit", kind: "file" },
      { id: "release-notes", label: "Release notes", kind: "file" },
      { id: "references", label: "Research sources", kind: "bookmark" },
    ],
  },
  {
    id: "design",
    label: "Design system",
    kind: "folder",
    children: [
      { id: "tokens", label: "Motion tokens", kind: "file" },
      { id: "components", label: "Component inventory", kind: "file" },
    ],
  },
  { id: "archive", label: "Archived runs", kind: "folder" },
];

const diffLines = [
  {
    id: "context-1",
    type: "context" as const,
    oldLine: 41,
    newLine: 41,
    content: "  const total = subtotal + shipping;",
  },
  {
    id: "removed-1",
    type: "removed" as const,
    oldLine: 42,
    content: "  return submitOrder(total);",
  },
  {
    id: "added-1",
    type: "added" as const,
    newLine: 42,
    content: "  const result = validateOrder({ total, items });",
  },
  {
    id: "added-2",
    type: "added" as const,
    newLine: 43,
    content: "  return result.ok ? submitOrder(total) : result;",
  },
];

const approvalQuestions: ApprovalCardQuestion[] = [
  {
    id: "release",
    title: "How should the patch be released?",
    options: [
      { value: "focused", label: "Ship the focused checkout fix" },
      { value: "bundle", label: "Bundle it with the next release" },
    ],
    allowCustom: true,
    customPlaceholder: "Add another release instruction…",
  },
];

const reply =
  "I’ll keep the patch focused, preserve the current checkout layout, and run the same validation path before preparing the release.";

// AISidebar Subcomponent
function AISidebar({
  items,
  activeId,
  defaultExpandedIds = [],
  onActiveChange,
}: {
  items: SidebarResource[];
  activeId: string;
  defaultExpandedIds?: string[];
  onActiveChange: (id: string) => void;
  onItemsChange?: (items: SidebarResource[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderItem = (item: SidebarResource, depth = 0) => {
    const isFolder = item.kind === "folder" || item.kind === "project";
    const isExpanded = expanded.has(item.id);
    const isActive = activeId === item.id;

    return (
      <div key={item.id} className="flex flex-col select-none">
        <button
          type="button"
          onClick={() => {
            if (isFolder) toggle(item.id);
            else onActiveChange(item.id);
          }}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-xs transition-colors",
            isActive
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {isFolder ? (
            isExpanded ? (
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{item.label}</span>
        </button>
        {isFolder && isExpanded && item.children ? (
          <div className="flex flex-col">
            {item.children.map((child) => renderItem(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return <div className="space-y-0.5">{items.map((i) => renderItem(i))}</div>;
}

// Subcomponents: Message, Bubble, Scroller
function MessageScroller({
  children,
  className,
  viewportClassName,
  contentClassName,
}: {
  busy?: boolean;
  navigation?: string;
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("relative flex size-full min-h-0 flex-col", className)}>
      <div
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain",
          viewportClassName,
        )}
      >
        <div className={cn(contentClassName)}>{children}</div>
      </div>
    </div>
  );
}

function MessageGroup({
  children,
  spacing,
  className,
}: {
  children: ReactNode;
  spacing?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        spacing === "default" && "gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Message({
  from,
  children,
  animateIn,
}: {
  from: "user" | "assistant";
  children: ReactNode;
  animateIn?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      initial={animateIn && !reduce ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex gap-3 text-sm",
        from === "user" ? "flex-row-reverse" : "flex-row",
      )}
    >
      {children}
    </motion.div>
  );
}

function MessageAvatar({
  children,
  placeholder,
}: {
  children?: ReactNode;
  placeholder?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border text-muted-foreground",
        placeholder
          ? "border-transparent bg-transparent"
          : "border-border/60 bg-muted/40",
      )}
    >
      {children}
    </div>
  );
}

function MessageContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-[85%] flex-col gap-1.5 sm:max-w-[75%]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MessageHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
      {children}
    </div>
  );
}

function MessageFooter({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] text-muted-foreground font-mono text-right mt-0.5">
      {children}
    </div>
  );
}

function MessageBubble({
  variant,
  children,
  className,
}: {
  variant?: "solid" | "soft" | "ghost";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
        variant === "solid" && "bg-primary text-primary-foreground",
        variant === "soft" && "bg-muted/70 text-foreground",
        variant === "ghost" && "bg-transparent text-foreground p-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MessageBubbleContent({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

// AgentActivity
function AgentActivity({
  status,
  duration,
  defaultOpen = false,
  items = [],
}: {
  status: "complete" | "running";
  duration?: number;
  defaultOpen?: boolean;
  collapseOnComplete?: boolean;
  items: {
    id: string;
    type: string;
    content?: string;
    action?: string;
    target?: string;
    query?: string;
    results?: { id: string; title: string; domain: string; url: string }[];
  }[];
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="w-full rounded-xl border border-border/70 bg-card/60 px-3.5 py-2 text-xs transition-colors">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left font-medium text-foreground"
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              status === "complete"
                ? "bg-emerald-500"
                : "bg-primary animate-pulse",
            )}
          />
          <span>Agent Activity ({items.length} steps)</span>
          {duration ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {duration}s
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2 text-muted-foreground font-mono text-[11px]">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-muted-foreground/60" />
              <span>
                {item.content ||
                  `${item.action ?? "check"} ${item.target ?? item.query ?? ""}`}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// TodoList
function TodoList({
  items,
  title,
}: {
  items: TodoItem[];
  title?: string;
  collapseOnComplete?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3 text-xs">
      {title ? (
        <div className="mb-2 font-medium text-muted-foreground">{title}</div>
      ) : null}
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 text-foreground"
          >
            <span
              className={cn(
                "grid size-4 place-items-center rounded border text-[10px]",
                item.status === "completed"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : item.status === "in-progress"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              {item.status === "completed"
                ? "✓"
                : item.status === "in-progress"
                  ? "⋯"
                  : "○"}
            </span>
            <span
              className={cn(
                item.status === "completed" &&
                  "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ToolApproval
function ToolApprovalCode({ code }: { code: string; language?: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {code}
    </code>
  );
}

function ToolApproval({
  tool,
  title,
  description,
  status,
  parameters = [],
  onApprove,
  onDeny,
}: {
  tool: string;
  title: string;
  description: string;
  status: ToolApprovalStatus;
  defaultOpen?: boolean;
  parameters?: { id: string; label: string; value: ReactNode }[];
  onApprove: () => void;
  onAlwaysAllow?: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5 text-xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Terminal className="size-3.5 text-primary" />
            <span>{title}</span>
          </div>
          <p className="mt-1 text-muted-foreground text-[11px]">
            {description}
          </p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {tool}
        </span>
      </div>

      <div className="space-y-1.5 rounded-lg bg-muted/30 p-2.5">
        {parameters.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between text-[11px]"
          >
            <span className="text-muted-foreground">{p.label}</span>
            <span>{p.value}</span>
          </div>
        ))}
      </div>

      {status === "pending" || status === "approving" ? (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onDeny}
            className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={status === "approving"}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {status === "approving" ? "Approving…" : "Approve"}
          </button>
        </div>
      ) : (
        <div className="text-[11px] font-mono text-muted-foreground">
          Status: {status}
        </div>
      )}
    </div>
  );
}

// ToolResult
function ToolResult({
  title,
  status,
  children,
  meta,
}: {
  tool: string;
  title: string;
  status: "running" | "success" | "cancelled" | "error";
  kind?: string;
  meta?: string;
  defaultOpen?: boolean;
  collapseOnComplete?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <span
            className={cn(
              "size-2 rounded-full",
              status === "success"
                ? "bg-emerald-500"
                : status === "running"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-destructive",
            )}
          />
          <span>{title}</span>
        </div>
        {meta ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ToolResultOutput({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted/50 p-2.5 font-mono text-[11px] text-foreground leading-relaxed">
      {children}
    </pre>
  );
}

// FileDiff
function FileDiff({
  file,
  lines,
}: {
  file: string;
  lines: {
    id: string;
    type: "context" | "added" | "removed";
    oldLine?: number;
    newLine?: number;
    content: string;
  }[];
  status?: string;
  defaultOpen?: boolean;
  collapseOnComplete?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden text-xs">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span>{file}</span>
        <span>Diff</span>
      </div>
      <div className="p-2 font-mono text-[11px] space-y-0.5 overflow-x-auto">
        {lines.map((l) => (
          <div
            key={l.id}
            className={cn(
              "px-2 py-0.5 rounded",
              l.type === "added" &&
                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              l.type === "removed" && "bg-destructive/15 text-destructive",
              l.type === "context" && "text-muted-foreground",
            )}
          >
            {l.type === "added" ? "+ " : l.type === "removed" ? "- " : "  "}
            {l.content}
          </div>
        ))}
      </div>
    </div>
  );
}

// CodeBlock
function CodeBlock({
  filename,
  code,
}: {
  filename: string;
  language: string;
  status?: string;
  code: string;
  showLineNumbers?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden text-xs">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FileCode className="size-3.5" />
          {filename}
        </span>
      </div>
      <pre className="p-3 font-mono text-[11px] text-foreground overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}

// ImageGeneration
function ImageGeneration({
  prompt,
  resolution,
  children,
}: {
  status: string;
  prompt: string;
  resolution: string;
  size?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span className="truncate">Prompt: {prompt}</span>
        <span>{resolution}</span>
      </div>
      <div className="aspect-video w-full rounded-lg overflow-hidden border border-border/50">
        {children}
      </div>
    </div>
  );
}

// StreamingResponse
function StreamingResponse({
  children,
  sources,
}: {
  status?: string;
  copyText?: string;
  sources?: { id: string; title: string; domain: string; url: string }[];
  showActions?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground text-sm leading-relaxed">
        {children}
      </div>
      {sources && sources.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground font-mono">
            Sources:
          </span>
          {sources.map((s) => (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <span>{s.title}</span>
              <ExternalLink className="size-2.5" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ApprovalCard
function ApprovalCard({
  questions,
  status,
  onSubmit,
  result,
}: {
  questions: ApprovalCardQuestion[];
  status: ApprovalCardStatus;
  onSubmit: () => void;
  result?: string;
}) {
  const [selected, setSelected] = useState(questions[0]?.options[0]?.value);

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 text-xs space-y-3">
      {questions.map((q) => (
        <div key={q.id} className="space-y-2">
          <div className="font-semibold text-foreground">{q.title}</div>
          <div className="space-y-1.5">
            {q.options.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border/70 p-2 cursor-pointer transition-colors",
                  selected === opt.value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "hover:bg-muted/40 text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name={q.id}
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                  className="size-3.5"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {status === "pending" || status === "submitting" ? (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onSubmit}
            disabled={status === "submitting"}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {status === "submitting" ? "Sending…" : "Send direction"}
          </button>
        </div>
      ) : (
        <div className="rounded-lg bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
          {result}
        </div>
      )}
    </div>
  );
}

// ThinkingShimmer
function ThinkingShimmer({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
      <span className="size-2 rounded-full bg-primary" />
      <span>{children}</span>
    </div>
  );
}

// PromptInput (beUI official style)
function PromptInput({
  value,
  onValueChange,
  loading,
  onStop,
  onSubmit,
  placeholder,
  models = [],
  defaultModel = "balanced",
  actions = [],
}: {
  value: string;
  onValueChange: (val: string) => void;
  loading?: boolean;
  onStop?: () => void;
  onSubmit: (val: string) => void;
  minRows?: number;
  maxRows?: number;
  placeholder?: string;
  models?: { value: string; label: string }[];
  defaultModel?: string;
  actions?: { value: string; label: string; icon: ReactNode }[];
}) {
  const [model, setModel] = useState(defaultModel);

  return (
    <div className="rounded-2xl border border-border/80 bg-background shadow-xs p-2.5 space-y-2">
      <textarea
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(value);
          }
        }}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-muted-foreground outline-none cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : null}
          {actions.map((act) => (
            <button
              key={act.value}
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {act.icon}
              <span className="hidden sm:inline">{act.label}</span>
            </button>
          ))}
        </div>
        <div>
          {loading ? (
            <button
              type="button"
              onClick={onStop}
              className="grid size-7 place-items-center rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSubmit(value)}
              className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <CornerDownLeft className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneratedPreview() {
  return (
    <svg viewBox="0 0 640 420" aria-hidden="true" className="size-full">
      <rect
        width="640"
        height="420"
        fill="currentColor"
        className="text-muted"
      />
      <rect
        x="64"
        y="52"
        width="512"
        height="316"
        rx="28"
        fill="currentColor"
        className="text-background"
      />
      <circle
        cx="320"
        cy="144"
        r="38"
        fill="currentColor"
        className="text-emerald-500"
      />
      <path
        d="m301 144 13 13 26-29"
        fill="none"
        stroke="white"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="204"
        y="210"
        width="232"
        height="18"
        rx="9"
        fill="currentColor"
        className="text-foreground/85"
      />
      <rect
        x="238"
        y="246"
        width="164"
        height="12"
        rx="6"
        fill="currentColor"
        className="text-muted-foreground/35"
      />
      <rect
        x="248"
        y="298"
        width="144"
        height="34"
        rx="17"
        fill="currentColor"
        className="text-foreground"
      />
    </svg>
  );
}

function AssistantIdentity({ label = "beUI Agent" }: { label?: string }) {
  return (
    <MessageHeader>
      <span>{label}</span>
      <span>Now</span>
    </MessageHeader>
  );
}

export function ChatAppExample({
  className,
}: Pick<ComponentProps<typeof ChatApp>, "className">) {
  const reduce = useReducedMotion() ?? false;
  const toolTimers = useRef<number[]>([]);
  const chatTimers = useRef<number[]>([]);
  const approvalTimers = useRef<number[]>([]);
  const runId = useRef(0);
  const [items, setItems] = useState(resources);
  const [activeResource, setActiveResource] = useState("checkout");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [activeReply, setActiveReply] = useState<string | null>(null);
  const [messages, setMessages] = useState<AddedMessage[]>([]);
  const [toolStatus, setToolStatus] = useState<ToolApprovalStatus>("pending");
  const [approvalStatus, setApprovalStatus] =
    useState<ApprovalCardStatus>("pending");

  const clearToolTimers = useCallback(() => {
    toolTimers.current.forEach((id) => window.clearTimeout(id));
    toolTimers.current = [];
  }, []);

  const clearChatTimers = useCallback(() => {
    chatTimers.current.forEach((id) => window.clearTimeout(id));
    chatTimers.current = [];
  }, []);

  const clearApprovalTimers = useCallback(() => {
    approvalTimers.current.forEach((id) => window.clearTimeout(id));
    approvalTimers.current = [];
  }, []);

  useEffect(
    () => () => {
      clearToolTimers();
      clearChatTimers();
      clearApprovalTimers();
    },
    [clearApprovalTimers, clearChatTimers, clearToolTimers],
  );

  const plan = useMemo<TodoItem[]>(() => {
    const checksStatus =
      toolStatus === "complete"
        ? "completed"
        : toolStatus === "running"
          ? "in-progress"
          : toolStatus === "denied" || toolStatus === "error"
            ? "cancelled"
            : "pending";

    return [
      {
        id: "inspect",
        title: "Inspect the checkout flow",
        status: "completed",
      },
      {
        id: "patch",
        title: "Prepare the validation patch",
        status: "completed",
      },
      { id: "checks", title: "Run focused checks", status: checksStatus },
      {
        id: "review",
        title: "Collect release approval",
        status: toolStatus === "complete" ? "in-progress" : "pending",
      },
    ];
  }, [toolStatus]);

  useEffect(() => {
    if (!activeReply) return;

    if (reduce) {
      setMessages((current) =>
        current.map((message) =>
          message.id === activeReply
            ? { ...message, content: reply, streaming: false }
            : message,
        ),
      );
      setActiveReply(null);
      return;
    }

    const startedAt = performance.now();
    let frame = 0;

    const stream = (now: number) => {
      const cursor = Math.min(
        reply.length,
        Math.floor(((now - startedAt) / 1000) * 92),
      );
      const content = reply.slice(0, cursor);

      setMessages((current) =>
        current.map((message) =>
          message.id === activeReply && message.content !== content
            ? { ...message, content }
            : message,
        ),
      );

      if (cursor < reply.length) {
        frame = requestAnimationFrame(stream);
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === activeReply
              ? { ...message, streaming: false }
              : message,
          ),
        );
        setActiveReply(null);
      }
    };

    frame = requestAnimationFrame(stream);
    return () => cancelAnimationFrame(frame);
  }, [activeReply, reduce]);

  const approveTool = () => {
    clearToolTimers();
    setToolStatus("approving");
    toolTimers.current = [
      window.setTimeout(() => setToolStatus("approved"), 450),
      window.setTimeout(() => setToolStatus("running"), 850),
      window.setTimeout(() => setToolStatus("complete"), 1650),
    ];
  };

  const submit = (value: string) => {
    if (!value.trim() || pending || activeReply) return;

    const id = runId.current++;
    const assistantId = `assistant-${id}`;

    setMessages((current) => [
      ...current,
      { id: `user-${id}`, from: "user", content: value },
    ]);
    setInput("");
    setPending(true);

    chatTimers.current.push(
      window.setTimeout(
        () => {
          setMessages((current) => [
            ...current,
            {
              id: assistantId,
              from: "assistant",
              content: "",
              streaming: true,
            },
          ]);
          setPending(false);
          setActiveReply(assistantId);
        },
        reduce ? 0 : 420,
      ),
    );
  };

  const stop = () => {
    clearChatTimers();
    setPending(false);
    setMessages((current) =>
      current.map((message) =>
        message.streaming ? { ...message, streaming: false } : message,
      ),
    );
    setActiveReply(null);
  };

  const busy = pending || activeReply !== null;

  return (
    <ChatApp sidebarWidth="17rem" className={cn("h-[760px]", className)}>
      <AnimatedSidebar
        ariaLabel="Agent workspace"
        collapsible="offcanvas"
        className="min-h-0"
        panelClassName="h-full bg-background"
      >
        <AnimatedSidebarContent className="gap-4 overflow-hidden px-2 py-4">
          {/* The workspace has no site header, so the mark doubles as the way
              back to the landing page. */}
          <AnimatedSidebarGroup className="shrink-0 px-1 py-0">
            <AnimatedSidebarGroupContent>
              <Link
                to="/"
                aria-label="ValueIQ home"
                title="ValueIQ home"
                className="grid size-9 place-items-center rounded-xl text-foreground outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <BrandMark size={22} />
              </Link>
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>

          <AnimatedSidebarGroup className="shrink-0 px-1 py-0">
            <AnimatedSidebarGroupContent>
              <AnimatedSidebarMenu className="gap-1">
                {[
                  { label: "New task", icon: MessageSquarePlus },
                  { label: "Search", icon: Search },
                  { label: "Runs", icon: Clock3 },
                ].map(({ label, icon: Icon }) => (
                  <AnimatedSidebarMenuItem key={label}>
                    <AnimatedSidebarMenuButton
                      icon={<Icon className="size-4" />}
                      onSelect={() => {}}
                      className="font-normal"
                    >
                      {label}
                    </AnimatedSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ))}
              </AnimatedSidebarMenu>
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>

          <AnimatedSidebarGroup className="min-h-0 flex-1 px-1 py-0">
            <AnimatedSidebarGroupLabel className="mb-1 h-8 px-2 text-xs font-medium normal-case tracking-normal">
              Projects
            </AnimatedSidebarGroupLabel>
            <AnimatedSidebarGroupContent className="relative min-h-0 flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto overscroll-contain pb-8 [overflow-anchor:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <AISidebar
                  items={items}
                  activeId={activeResource}
                  defaultExpandedIds={["release", "design"]}
                  onActiveChange={setActiveResource}
                  onItemsChange={setItems}
                />
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent"
              />
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>
        </AnimatedSidebarContent>
        <AnimatedSidebarRail />
      </AnimatedSidebar>

      <AnimatedSidebarInset className="min-h-0 bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between border-border border-b px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <AnimatedSidebarTrigger className="text-muted-foreground hover:bg-muted hover:text-foreground">
              <PanelLeft className="size-4" />
            </AnimatedSidebarTrigger>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                Checkout release
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Agent workspace · focused patch
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            Connected
          </span>
        </header>

        <MessageScroller
          busy={busy}
          navigation="rail"
          className="min-h-0 flex-1"
          viewportClassName="px-3 py-5 sm:px-5"
          contentClassName="mx-auto min-h-full w-full max-w-3xl"
        >
          <MessageGroup spacing="default">
            <Message from="user">
              <MessageAvatar>
                <User className="size-4" />
              </MessageAvatar>
              <MessageContent>
                <MessageHeader>
                  <span>You</span>
                  <span>10:24</span>
                </MessageHeader>
                <MessageBubble variant="solid">
                  <MessageBubbleContent>
                    Audit the checkout flow, fix the validation gap, and prepare
                    a release-ready patch.
                  </MessageBubbleContent>
                </MessageBubble>
              </MessageContent>
            </Message>
            <Message from="assistant">
              <MessageAvatar>
                <Bot className="size-4" />
              </MessageAvatar>
              <MessageContent className="gap-3">
                <MessageHeader>
                  <span>beUI Agent</span>
                  <span>10:24</span>
                </MessageHeader>
                <AgentActivity
                  status="complete"
                  duration={6}
                  defaultOpen
                  collapseOnComplete={false}
                  items={[
                    {
                      id: "reason",
                      type: "text",
                      content:
                        "Tracing the checkout submission path and validation boundary.",
                    },
                    {
                      id: "read",
                      type: "tool",
                      action: "read",
                      target: "checkout/submit.ts",
                    },
                    {
                      id: "search",
                      type: "search",
                      query: "order validation failures",
                      results: [
                        {
                          id: "result-1",
                          title: "Agent interface guide",
                          domain: "beui.dev",
                          url: "/docs/ai-agents",
                        },
                      ],
                    },
                  ]}
                />
                <TodoList
                  items={plan}
                  title="Release plan"
                  collapseOnComplete={false}
                />
              </MessageContent>
            </Message>
            <Message from="assistant">
              <MessageAvatar placeholder />
              <MessageContent>
                <ToolApproval
                  tool="terminal.run"
                  title="Run focused checkout checks?"
                  description="The agent needs permission to run the validation and accessibility suites."
                  status={toolStatus}
                  defaultOpen
                  parameters={[
                    {
                      id: "command",
                      label: "Command",
                      value: (
                        <ToolApprovalCode
                          code="bun test checkout --coverage"
                          language="bash"
                        />
                      ),
                    },
                    { id: "scope", label: "Scope", value: "Current workspace" },
                  ]}
                  onApprove={approveTool}
                  onAlwaysAllow={approveTool}
                  onDeny={() => {
                    clearToolTimers();
                    setToolStatus("denied");
                  }}
                />
              </MessageContent>
            </Message>
            {toolStatus === "running" || toolStatus === "complete" ? (
              <Message from="assistant" animateIn>
                <MessageAvatar placeholder />
                <MessageContent className="gap-3">
                  <ToolResult
                    tool="terminal.run"
                    title={
                      toolStatus === "running"
                        ? "Running checkout checks"
                        : "Checkout checks passed"
                    }
                    status={toolStatus === "running" ? "running" : "success"}
                    kind="terminal"
                    meta={toolStatus === "running" ? "Live" : "2.8s"}
                    defaultOpen
                    collapseOnComplete={false}
                  >
                    <ToolResultOutput>
                      {toolStatus === "running"
                        ? "✓ validation contract\n… checkout keyboard flow"
                        : "✓ validation contract\n✓ checkout keyboard flow\n✓ order submission recovery"}
                    </ToolResultOutput>
                  </ToolResult>
                  {toolStatus === "complete" ? (
                    <>
                      <FileDiff
                        file="checkout/submit.ts"
                        lines={diffLines}
                        status="complete"
                        defaultOpen
                        collapseOnComplete={false}
                      />
                      <CodeBlock
                        filename="validation.ts"
                        language="typescript"
                        status="complete"
                        code={
                          "export function validateOrder(order: Order) {\n  return schema.safeParse(order);\n}"
                        }
                        showLineNumbers
                      />
                    </>
                  ) : null}
                </MessageContent>
              </Message>
            ) : toolStatus === "denied" || toolStatus === "error" ? (
              <Message from="assistant" animateIn>
                <MessageAvatar placeholder />
                <MessageContent>
                  <ToolResult
                    tool="terminal.run"
                    title="Checkout checks were not run"
                    status={toolStatus === "denied" ? "cancelled" : "error"}
                    kind="terminal"
                    defaultOpen
                    collapseOnComplete={false}
                  >
                    <ToolResultOutput>
                      {toolStatus === "denied"
                        ? "Permission was not granted. No command was run."
                        : "The command could not be completed."}
                    </ToolResultOutput>
                  </ToolResult>
                </MessageContent>
              </Message>
            ) : null}
            {toolStatus === "complete" ? (
              <Message from="assistant" animateIn>
                <MessageAvatar placeholder />
                <MessageContent className="gap-3">
                  <ImageGeneration
                    status="complete"
                    prompt="a clear checkout confirmation screen"
                    resolution="1280 × 840"
                    size="compact"
                  >
                    <GeneratedPreview />
                  </ImageGeneration>
                  <MessageBubble variant="ghost" className="w-full">
                    <MessageBubbleContent>
                      <StreamingResponse
                        status="complete"
                        copyText="The checkout patch is ready for review."
                        sources={[
                          {
                            id: "message",
                            title: "Message composition",
                            domain: "beui.dev",
                            url: "/components/agents/message",
                          },
                          {
                            id: "diff",
                            title: "File Diff",
                            domain: "beui.dev",
                            url: "/components/agents/file-diff",
                          },
                          {
                            id: "approval",
                            title: "Tool Approval",
                            domain: "beui.dev",
                            url: "/components/agents/tool-approval",
                          },
                        ]}
                      >
                        <p>The checkout patch is ready for review.</p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li>Validation now runs before submission.</li>
                          <li>Failure output stays inside the current flow.</li>
                          <li>
                            Focused checks pass without changing the layout.
                          </li>
                        </ul>
                      </StreamingResponse>
                    </MessageBubbleContent>
                  </MessageBubble>
                </MessageContent>
              </Message>
            ) : null}
            {toolStatus === "complete" ? (
              <Message from="assistant" animateIn>
                <MessageAvatar placeholder />
                <MessageContent>
                  <ApprovalCard
                    questions={approvalQuestions}
                    status={approvalStatus}
                    onSubmit={() => {
                      setApprovalStatus("submitting");
                      clearApprovalTimers();
                      approvalTimers.current.push(
                        window.setTimeout(
                          () => setApprovalStatus("answered"),
                          650,
                        ),
                      );
                    }}
                    result="Release direction sent to the agent."
                  />
                </MessageContent>
              </Message>
            ) : null}
            {messages.map((message) => (
              <Message key={message.id} from={message.from} animateIn>
                {message.from === "assistant" ? (
                  <MessageAvatar>
                    <Bot className="size-4" />
                  </MessageAvatar>
                ) : (
                  <MessageAvatar>
                    <User className="size-4" />
                  </MessageAvatar>
                )}
                <MessageContent>
                  {message.from === "assistant" ? (
                    <AssistantIdentity label="beUI Agent" />
                  ) : null}
                  <MessageBubble
                    variant={message.from === "user" ? "solid" : "soft"}
                  >
                    <MessageBubbleContent>
                      {message.from === "assistant" ? (
                        <StreamingResponse
                          status={message.streaming ? "streaming" : "complete"}
                          showActions={!message.streaming}
                          copyText={message.content}
                        >
                          {message.content}
                        </StreamingResponse>
                      ) : (
                        message.content
                      )}
                    </MessageBubbleContent>
                  </MessageBubble>
                  {message.from === "user" ? (
                    <MessageFooter>Sent</MessageFooter>
                  ) : null}
                </MessageContent>
              </Message>
            ))}
            {pending ? (
              <Message from="assistant" animateIn>
                <MessageAvatar>
                  <Bot className="size-4" />
                </MessageAvatar>
                <MessageContent>
                  <ThinkingShimmer>Reviewing your direction</ThinkingShimmer>
                </MessageContent>
              </Message>
            ) : null}
          </MessageGroup>
        </MessageScroller>

        <div className="shrink-0 border-border border-t bg-background p-3">
          <div className="mx-auto max-w-3xl">
            <PromptInput
              value={input}
              onValueChange={setInput}
              loading={busy}
              onStop={stop}
              onSubmit={submit}
              minRows={1}
              maxRows={4}
              placeholder="Ask the agent to continue…"
              models={[
                { value: "balanced", label: "Balanced" },
                { value: "fast", label: "Fast" },
                { value: "deep", label: "Deep reasoning" },
              ]}
              defaultModel="balanced"
              actions={[
                {
                  value: "attach",
                  label: "Attach file",
                  icon: <Paperclip className="size-3.5" />,
                },
                {
                  value: "project",
                  label: "Add project context",
                  icon: <FolderKanban className="size-3.5" />,
                },
                {
                  value: "skill",
                  label: "Use a skill",
                  icon: <WandSparkles className="size-3.5" />,
                },
              ]}
            />
          </div>
        </div>
      </AnimatedSidebarInset>
    </ChatApp>
  );
}
