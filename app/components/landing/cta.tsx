import { ExpandingArrowButton } from "~/components/motion/expanding-arrow-button";
import { FluidMeshBackground } from "~/components/ui/fluid-mesh-background";
import { Container, marketingButton } from "./primitives";
import { Reveal } from "./reveal";

export function Cta() {
  return (
    <section className="relative isolate overflow-hidden bg-background text-foreground">
      <FluidMeshBackground
        intensity="subtle"
        variant="canvas"
        className="opacity-40"
      />
      <div className="brand-wash absolute inset-0" aria-hidden="true" />
      <Container className="relative py-20 lg:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl leading-[1.02] font-semibold tracking-[-0.02em] text-balance sm:text-5xl lg:text-[56px] lg:leading-none">
            Start with a project.
          </h2>
          <p className="mt-6 text-lg leading-[1.3] text-muted-foreground">
            Describe the change. The assessment asks for the rest, one question
            at a time.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ExpandingArrowButton to="/workspace" tone="primary">
              Open workspace
            </ExpandingArrowButton>
            <a href="#method" className={marketingButton({ tone: "outline" })}>
              See how it works
            </a>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
