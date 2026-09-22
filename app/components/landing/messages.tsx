import { Bot } from "lucide-react";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "~/components/ui/message";

/** Shared transcript bubbles for the landing page's product representations. */
export function AgentBubble({ children }: { children: string }) {
  return (
    <Message>
      <MessageAvatar className="size-7 bg-primary/10 text-primary">
        <Bot className="size-3.5" />
      </MessageAvatar>
      <MessageContent>
        <Bubble variant="muted">
          <BubbleContent>{children}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

export function UserBubble({ children }: { children: string }) {
  return (
    <Message align="end">
      <MessageContent>
        <Bubble>
          <BubbleContent>{children}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
