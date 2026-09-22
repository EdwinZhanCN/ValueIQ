import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Database,
  FileText,
  Lock,
  MessagesSquare,
  Sigma,
} from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Badge } from "~/components/ui/badge";
import { MessageGroup } from "~/components/ui/message";
import { cn } from "~/lib/utils";
import { AgentBubble } from "./messages";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./reveal";

/** Hairline panel that frames each step's product representation. */
function PanelShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
        <p className="text-[13px] font-medium">{label}</p>
        <Badge
          variant="outline"
          className="font-mono text-[10px] text-muted-foreground"
        >
          Example
        </Badge>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm">{value}</p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function DescribePanel() {
  return (
    <PanelShell label="Assessment brief">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Process to change" value="Weekly manual reporting" />
        <Field
          label="Useful outcome"
          value="Analyst time back, fewer rework hours"
        />
        <Field
          label="Evidence on hand"
          value="Report owners, frequency, source systems"
        />
      </div>
    </PanelShell>
  );
}

function FollowUpsPanel() {
  return (
    <PanelShell label="Follow-up questions">
      <MessageGroup className="gap-3">
        <AgentBubble>
          I still need the current error rate and the cost per rework hour
          before I can estimate quality impact.
        </AgentBubble>
      </MessageGroup>
      <div className="mt-4 space-y-2.5">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 py-2.5">
          <span className="text-sm">Error rate</span>
          <span className="text-sm text-muted-foreground">
            fraction of runs
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 py-2.5">
          <span className="text-sm">Cost per rework hour</span>
          <span className="text-sm text-muted-foreground">your currency</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          "rates: 0–1",
          "periods: hour · week · month · year",
          "quantities: finite, ≥ 0",
        ].map((rule) => (
          <Badge
            key={rule}
            variant="outline"
            className="font-mono text-[10px] text-muted-foreground"
          >
            {rule}
          </Badge>
        ))}
      </div>
    </PanelShell>
  );
}

function ReviewPanel() {
  return (
    <PanelShell label="Computation trace">
      <pre className="overflow-x-auto rounded-xl bg-muted/60 p-4 font-mono text-[0.8rem] leading-7">
        capacity = people × hours_per_week × weeks × realization
      </pre>
      <dl className="mt-5 space-y-3 text-sm">
        <StatRow label="people" value="6 · integer, ≥ 0" />
        <StatRow label="hours_per_week" value="3.5 · finite, ≥ 0" />
        <StatRow label="weeks" value="52 · integer, ≥ 0" />
        <StatRow label="realization" value="0.6 · fraction in [0, 1]" />
      </dl>
    </PanelShell>
  );
}

function RecordPanel() {
  return (
    <PanelShell label="Saved to the project record">
      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
          <dt className="text-muted-foreground">Conversation</dt>
          <dd>
            <Badge className="text-[10px]">Saved</Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
          <dt className="text-muted-foreground">Inputs and results</dt>
          <dd>
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              Planned
            </Badge>
          </dd>
        </div>
      </dl>
      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Records are kept against the project, so the estimate outlives the
        conversation.
      </p>
    </PanelShell>
  );
}

const STEPS = [
  {
    id: "describe",
    icon: FileText,
    title: "Describe the change",
    body: "Name the process this project would replace or improve, and what a useful outcome looks like.",
    panel: <DescribePanel />,
  },
  {
    id: "answer",
    icon: MessagesSquare,
    title: "Answer the follow-ups",
    body: "The assessment asks for the hours, rates, periods and evidence it still needs before it estimates anything.",
    panel: <FollowUpsPanel />,
  },
  {
    id: "review",
    icon: Sigma,
    title: "Review the math",
    body: "Capacity, data quality and risk reduction are computed from your stated inputs with visible formulas.",
    panel: <ReviewPanel />,
  },
  {
    id: "keep",
    icon: Database,
    title: "Keep the record",
    body: "Validated inputs and results are stored against the project, so the estimate outlives the conversation.",
    panel: <RecordPanel />,
  },
];

export function Method() {
  const [active, setActive] = useState(() => STEPS[0]?.id ?? "describe");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const articles =
      document.querySelectorAll<HTMLElement>("[data-method-step]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-method-step");
          if (id) setActive(id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    articles.forEach((article) => observer.observe(article));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="method" className="scroll-mt-30 border-b border-border/70">
      <Container className="py-20 lg:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow>Method</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl lg:text-[40px] lg:leading-[1.1]">
            How an assessment runs
          </h2>
          <p className="mt-5 text-lg leading-[1.3] text-muted-foreground">
            Four passes turn a project description into a reviewable estimate.
          </p>
          <Link
            to="/workspace"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Open workspace
            <ArrowRight className="size-4" />
          </Link>
        </Reveal>
        <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-8">
          <nav
            aria-label="Assessment steps"
            className="hidden lg:col-span-3 lg:block"
          >
            <ol className="sticky top-30 space-y-1">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const isSelected = active === step.id;
                return (
                  <li key={step.id}>
                    <a
                      href={`#${step.id}`}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        isSelected
                          ? "text-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {isSelected ? (
                        <motion.div
                          layoutId="active-method-step-indicator"
                          className="absolute inset-0 rounded-[10px] bg-muted shadow-xs"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 32,
                          }}
                        />
                      ) : null}
                      <span className="relative z-10 flex items-center gap-3">
                        <Icon className="size-4 shrink-0" />
                        {step.title}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="min-w-0 lg:col-span-9">
            {STEPS.map((step, index) => (
              <article
                key={step.id}
                id={step.id}
                data-method-step={step.id}
                className={cn(
                  "scroll-mt-30 py-10 first:pt-0 lg:py-16",
                  index > 0 && "border-t border-border/70",
                )}
              >
                <Reveal>
                  <h3 className="text-2xl font-medium tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </Reveal>
                <Reveal delay={0.08} className="mt-8">
                  {step.panel}
                </Reveal>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
