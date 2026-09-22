import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./reveal";

const FAQS = [
  {
    question: "Does a model make up the numbers?",
    answer:
      "No. Arithmetic belongs to deterministic TypeScript functions with unit tests that check rates, quantities and overflow. The model's future role is choosing questions and tools, not inventing values.",
  },
  {
    question: "What happens when information is missing?",
    answer:
      "The assessment asks for it. Missing facts produce follow-up questions instead of silent assumptions, and a figure is only reported once its inputs and period are stated.",
  },
  {
    question: "Where is my data stored?",
    answer:
      "In your own Cloudflare account: D1 holds projects, assessments and eventually validated inputs and results, while a Durable Object keeps the live conversation. No model provider is called today.",
  },
  {
    question: "Can I run ValueIQ myself?",
    answer:
      "Yes. Local development needs Node and pnpm, and deployment provisions a D1 database and the Worker in your Cloudflare account. The README documents both paths.",
  },
  {
    question: "Is there authentication?",
    answer:
      "Not yet. A deployed instance is a shared prototype, so add access control before using it with real commercial data.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-30 border-b border-border/70">
      <Container className="grid gap-12 py-20 lg:grid-cols-12 lg:gap-8 lg:py-28">
        <div className="lg:col-span-4">
          <Reveal>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl lg:text-[40px] lg:leading-[1.1]">
              Questions people ask first
            </h2>
            <p className="mt-5 text-lg leading-[1.3] text-muted-foreground">
              The honest answers, including what ValueIQ will not claim.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.08} className="lg:col-span-7 lg:col-start-6">
          <Accordion>
            {FAQS.map((item, index) => (
              <AccordionItem key={item.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-base">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="max-w-2xl leading-relaxed text-muted-foreground">
                    {item.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </Container>
    </section>
  );
}
