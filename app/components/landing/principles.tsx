import { Database, MessageSquare, Sigma } from "lucide-react";
import { TiltCard } from "~/components/motion/tilt-card";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./reveal";

const PRINCIPLES = [
  {
    icon: Sigma,
    title: "Deterministic math",
    body: "Rates, periods and units are validated by tested TypeScript tools, not by a language model.",
  },
  {
    icon: MessageSquare,
    title: "Evidence or questions",
    body: "Missing facts produce follow-up questions instead of invented numbers.",
  },
  {
    icon: Database,
    title: "Records you keep",
    body: "Projects, inputs and results live in your own Cloudflare database, not in a chat log.",
  },
];

export function Principles() {
  return (
    <section className="bg-muted text-foreground">
      <Container className="py-20 lg:py-28">
        <Reveal className="max-w-3xl">
          <Eyebrow className="text-primary">Core beliefs</Eyebrow>
          <h2 className="mt-6 text-4xl leading-[1.04] font-semibold tracking-[-0.02em] text-balance sm:text-5xl lg:text-[64px] lg:leading-none">
            Evidence, not guesses.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-[1.35] text-muted-foreground">
            Missing facts should produce follow-up questions, not invented
            monetary results. The model's future role is choosing questions and
            tools, not inventing values.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-3 lg:mt-20">
          {PRINCIPLES.map((principle, index) => {
            const Icon = principle.icon;
            return (
              <Reveal key={principle.title} delay={index * 0.08}>
                <TiltCard className="h-full">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Icon className="size-4" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
                    {principle.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {principle.body}
                  </p>
                </TiltCard>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
