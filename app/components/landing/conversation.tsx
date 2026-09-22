import { Badge } from "~/components/ui/badge";
import { MessageGroup } from "~/components/ui/message";
import { AgentBubble, UserBubble } from "./messages";
import { Container, Eyebrow } from "./primitives";
import { Reveal } from "./reveal";

type Line = { from: "agent" | "user"; text: string };

const LINES: Line[] = [
  { from: "agent", text: "What process would this project change?" },
  {
    from: "user",
    text: "Weekly manual reporting. Six analysts compile it from three systems.",
  },
  {
    from: "agent",
    text: "How many hours per analyst each week does the report take?",
  },
  { from: "user", text: "About three and a half, and half of that is rework." },
  {
    from: "agent",
    text: "I still need the current error rate and the cost per rework hour before I can estimate quality impact.",
  },
];

export function Conversation() {
  return (
    <section
      id="conversation"
      className="scroll-mt-30 border-b border-border/70 bg-muted/40"
    >
      <Container className="grid gap-12 py-20 lg:grid-cols-12 lg:gap-8 lg:py-28">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>Conversation</Eyebrow>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl lg:text-[40px] lg:leading-[1.1]">
              It asks before it assumes
            </h2>
            <p className="mt-5 text-lg leading-[1.3] text-muted-foreground">
              When a number is missing, the assessment asks for the number, the
              period and the unit. It does not fill the gap with a guess.
            </p>
            <blockquote className="mt-8 border-l-2 border-primary/50 pl-4 text-sm leading-relaxed text-muted-foreground">
              Missing facts should produce follow-up questions, not invented
              monetary results.
            </blockquote>
          </Reveal>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
              <header className="mb-5 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  Assessment conversation
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] text-muted-foreground"
                >
                  Intended flow
                </Badge>
              </header>
              <MessageGroup className="gap-3">
                {LINES.map((line, index) =>
                  line.from === "agent" ? (
                    <Reveal key={line.text} delay={index * 0.05} y={10}>
                      <AgentBubble>{line.text}</AgentBubble>
                    </Reveal>
                  ) : (
                    <Reveal key={line.text} delay={index * 0.05} y={10}>
                      <UserBubble>{line.text}</UserBubble>
                    </Reveal>
                  ),
                )}
              </MessageGroup>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
