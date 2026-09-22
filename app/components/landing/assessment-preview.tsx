import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "~/components/ui/message";
import { BrandMark } from "~/components/brand";

const INPUTS = [
  { label: "Headcount", value: "6", status: "verified" },
  { label: "Hours/week", value: "3.5 h", status: "verified" },
  { label: "Realization", value: "0.6", status: "verified" },
];

export function AssessmentPreview() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card text-card-foreground shadow-xl shadow-foreground/5">
      {/* Top Window Chrome */}
      <div className="flex h-12 items-center justify-between border-b border-border/70 px-4 sm:px-5 bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-3 rounded-full bg-muted-foreground/30" />
            <span className="size-3 rounded-full bg-muted-foreground/30" />
            <span className="size-3 rounded-full bg-muted-foreground/30" />
          </div>
          <span className="h-4 w-px bg-border/80 hidden sm:inline-block" />
          <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <BrandMark size={18} />
            <span>ValueIQ Workspace</span>
            <span className="text-muted-foreground font-normal hidden md:inline">
              · Ops Reporting Automation
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            Collecting Context
          </span>
          <Badge
            variant="outline"
            className="font-mono text-[10px] text-muted-foreground hidden sm:inline-flex"
          >
            Example Session
          </Badge>
        </div>
      </div>

      {/* Workspace Grid */}
      <div className="grid lg:grid-cols-[1.55fr_1fr]">
        {/* Left Conversation Area */}
        <div className="border-b border-border/70 p-5 sm:p-6 lg:border-r lg:border-b-0 space-y-4">
          <MessageGroup className="gap-4">
            <Message>
              <MessageAvatar className="size-7 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <BrandMark size={16} />
              </MessageAvatar>
              <MessageContent>
                <MessageHeader className="text-xs font-medium">
                  ValueIQ Agent
                </MessageHeader>
                <Bubble variant="muted" className="shadow-xs">
                  <BubbleContent>
                    <p className="text-xs leading-relaxed">
                      What process would this project change, and how many
                      people are involved?
                    </p>
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>

            <Message align="end">
              <MessageContent>
                <MessageHeader className="justify-end text-xs text-muted-foreground">
                  <span>You</span>
                </MessageHeader>
                <Bubble className="bg-primary text-primary-foreground shadow-xs">
                  <BubbleContent>
                    <p className="text-xs leading-relaxed">
                      Weekly manual reporting: 6 analysts compile it, taking
                      about 3.5 hours each week.
                    </p>
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>

            <div className="pl-9 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-3.5 py-2 text-xs">
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-2 rounded-full bg-primary" />
                  <span>Evidence verified: 6 people × 3.5 h/wk</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  0.6s
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium text-foreground">
                    calculateCapacity
                  </span>
                  <span className="font-mono text-[10px] text-foreground font-semibold">
                    655.2 h / yr
                  </span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  capacity = people × hours_per_week × weeks × realization
                </p>
              </div>
            </div>
          </MessageGroup>

          {/* Mini Prompt Input Preview */}
          <div className="pt-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 truncate">
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="truncate">
                  Enter follow-up details (e.g. error rate, rework cost)…
                </span>
              </div>
              <span className="font-mono text-[10px] rounded border border-border px-1.5 py-0.5">
                ↵ Enter
              </span>
            </div>
          </div>
        </div>

        {/* Right Audit & Inspection Panel */}
        <div className="flex flex-col gap-5 p-5 sm:p-6 bg-muted/20">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase font-semibold">
                Verified Inputs
              </p>
              <span className="text-[11px] font-mono text-primary flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                Audited
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 divide-x divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card/80 text-center">
              {INPUTS.map((input) => (
                <div key={input.label} className="px-2 py-2.5">
                  <dt className="text-[10px] text-muted-foreground truncate">
                    {input.label}
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                    {input.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">
                Capacity Output
              </p>
              <span className="font-mono text-base font-bold text-primary">
                ≈ 655.2 h / yr
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Tested arithmetic tool contract. No model approximation.
            </p>
          </div>

          <div>
            <p className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase font-semibold">
              Pending Evidence
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Current error rate and cost per rework hour are needed before
              quality and loss avoided can be computed.
            </p>
          </div>

          <div className="mt-auto flex items-center gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary shrink-0" />
            <span>Pure TypeScript Math · D1 Persisted Record</span>
          </div>
        </div>
      </div>
    </div>
  );
}
