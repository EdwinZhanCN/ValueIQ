import { ExpandingArrowButton } from "~/components/motion/expanding-arrow-button";
import { TextReveal } from "~/components/motion/text-reveal";
import { FluidMeshBackground } from "~/components/ui/fluid-mesh-background";
import { AssessmentPreview } from "./assessment-preview";
import { Container, Eyebrow, marketingButton } from "./primitives";
import { Reveal } from "./reveal";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/70">
      {/*
        Ambient fluid mesh gradient background layered with faint grid architecture.
        Creates a subtle theme-derived color wash that smoothly fades into the content.
      */}
      <FluidMeshBackground intensity="subtle" />
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-30"
        aria-hidden="true"
      >
        <div className="column-lines absolute inset-0" />
      </div>

      <div className="relative z-10">
        <Container className="pt-16 pb-14 lg:pt-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <Reveal>
              <Eyebrow>Project value assessment</Eyebrow>
            </Reveal>
            <TextReveal
              as="h1"
              text="Know what a project is worth before you fund it."
              split="word"
              stagger={0.05}
              className="mt-5 text-4xl leading-[1.02] font-semibold tracking-[-0.02em] text-balance sm:text-5xl lg:text-[64px] lg:leading-[0.95]"
            />
            <Reveal delay={0.35}>
              <p className="mt-6 max-w-[27em] text-lg leading-[1.3] text-muted-foreground">
                ValueIQ asks about the change, collects the missing facts, and
                estimates value with auditable math.
              </p>
            </Reveal>
            <Reveal
              delay={0.45}
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              <ExpandingArrowButton to="/workspace">
                Open workspace
              </ExpandingArrowButton>
              <a
                href="#method"
                className={marketingButton({ tone: "outline" })}
              >
                See how it works
              </a>
            </Reveal>
          </div>
          <Reveal delay={0.2} y={28} className="mt-14 lg:mt-20">
            <div className="mx-auto max-w-300">
              <AssessmentPreview />
            </div>
          </Reveal>
        </Container>
      </div>
    </section>
  );
}
