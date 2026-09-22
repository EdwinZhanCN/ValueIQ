import { Check } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./reveal";

const RULES = [
  "Rates are fractions between 0 and 1, never percentages in disguise.",
  "Every tool names its period: hour, week, month or year.",
  "Invalid rates, quantities and overflow return errors, not values.",
  "No implicit currency conversion, annualization or cross-category aggregation.",
];

export function Calculations() {
  return (
    <section
      id="calculations"
      className="scroll-mt-30 border-b border-border bg-muted text-foreground"
    >
      <Container className="py-20 lg:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow className="text-primary">Calculations</Eyebrow>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl lg:text-[40px] lg:leading-[1.1]">
            Auditable by construction
          </h2>
          <p className="mt-5 text-lg leading-[1.3] text-muted-foreground">
            Every figure comes from a formula with named inputs in known units.
            You can follow the arithmetic from the conversation to the result.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-12">
          <Reveal className="min-w-0 lg:col-span-7">
            <div className="h-full rounded-2xl border border-border bg-card text-card-foreground p-6 sm:p-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-lg bg-primary/20 text-primary">
                      <Check className="size-3.5" />
                    </span>
                    <p className="text-sm font-semibold tracking-tight text-foreground">
                      Worked example: capacity
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-border font-mono text-[10px] text-muted-foreground"
                  >
                    Audited Contract
                  </Badge>
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-border bg-muted p-4 font-mono text-[0.82rem] leading-relaxed">
                  <span className="text-primary">calculateCapacity</span>(
                  <div className="pl-4 text-muted-foreground space-y-0.5">
                    <div>
                      people:{" "}
                      <span className="text-foreground font-semibold">6</span>,
                    </div>
                    <div>
                      hours_per_week:{" "}
                      <span className="text-foreground font-semibold">3.5</span>
                      ,
                    </div>
                    <div>
                      weeks:{" "}
                      <span className="text-foreground font-semibold">52</span>,
                    </div>
                    <div>
                      realization:{" "}
                      <span className="text-foreground font-semibold">0.6</span>
                    </div>
                  </div>
                  )
                </div>

                <div className="mt-4 rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground flex items-center justify-between">
                  <span>6 × 3.5 × 52 × 0.6</span>
                  <span className="text-primary font-semibold">= 655.20 h</span>
                </div>
              </div>

              <div className="mt-6 border-t border-border/60 pt-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Estimated capacity recovered
                  </p>
                  <p className="font-mono text-2xl font-semibold text-primary whitespace-nowrap">
                    ≈ 655.2 h / yr
                  </p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  An estimate derived from pure TypeScript calculation, not
                  guaranteed cash savings.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.08} className="min-w-0 lg:col-span-5">
            <div className="h-full rounded-2xl border border-border bg-card text-card-foreground p-6">
              <p className="text-sm font-medium">Tool contracts</p>
              <ul className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                {RULES.map((rule) => (
                  <li key={rule} className="flex gap-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
