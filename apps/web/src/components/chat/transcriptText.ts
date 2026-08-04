/**
 * The thread rendered as one markdown document.
 *
 * Plain text, because the point is to select and copy it: what you see in the
 * viewer is exactly what lands on the clipboard, with no chips, widgets, or
 * collapsed sections in the way.
 */
import type { OrchestrationMessage } from "@t3tools/contracts";

const ROLE_HEADINGS: Readonly<Record<OrchestrationMessage["role"], string>> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
};

export interface TranscriptOptions {
  /** Thread title, used as the document heading when there is one. */
  readonly title?: string | null;
}

export function buildTranscriptMarkdown(
  messages: ReadonlyArray<Pick<OrchestrationMessage, "role" | "text">>,
  options: TranscriptOptions = {},
): string {
  const sections: string[] = [];
  const title = options.title?.trim();
  if (title) sections.push(`# ${title}`);

  for (const message of messages) {
    const text = message.text.trim();
    // Streaming placeholders and tool-only turns carry no text; a heading with
    // nothing under it is just noise in a document meant for reading.
    if (text.length === 0) continue;
    sections.push(`## ${ROLE_HEADINGS[message.role]}\n\n${text}`);
  }

  return sections.join("\n\n");
}
