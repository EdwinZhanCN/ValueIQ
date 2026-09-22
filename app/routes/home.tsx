import type { Route } from "./+types/home";
import { Hero } from "~/components/landing/hero";
import { Principles } from "~/components/landing/principles";
import { Method } from "~/components/landing/method";
import { Conversation } from "~/components/landing/conversation";
import { Calculations } from "~/components/landing/calculations";
import { Faq } from "~/components/landing/faq";
import { Cta } from "~/components/landing/cta";

export const meta: Route.MetaFunction = () => [
  { title: "ValueIQ: know what a project is worth" },
  {
    name: "description",
    content:
      "ValueIQ interviews you about a proposed change, collects missing facts, and estimates capacity, quality and risk with auditable math.",
  },
];

export default function Home() {
  return (
    <>
      <Hero />
      <Principles />
      <Method />
      <Conversation />
      <Calculations />
      <Faq />
      <Cta />
    </>
  );
}
