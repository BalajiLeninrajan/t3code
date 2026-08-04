import { describe, expect, it } from "vite-plus/test";

import { buildTranscriptMarkdown } from "./transcriptText";

describe("buildTranscriptMarkdown", () => {
  it("renders each message under a role heading", () => {
    expect(
      buildTranscriptMarkdown([
        { role: "user", text: "how do I run the tests?" },
        { role: "assistant", text: "`vp test run`" },
      ]),
    ).toBe("## You\n\nhow do I run the tests?\n\n## Assistant\n\n`vp test run`");
  });

  it("leads with the thread title when there is one", () => {
    expect(
      buildTranscriptMarkdown([{ role: "user", text: "hi" }], { title: "Fix the parser" }),
    ).toBe("# Fix the parser\n\n## You\n\nhi");
  });

  it("ignores a blank title", () => {
    expect(buildTranscriptMarkdown([{ role: "user", text: "hi" }], { title: "   " })).toBe(
      "## You\n\nhi",
    );
  });

  it("skips messages with no text, so tool-only turns leave no empty heading", () => {
    expect(
      buildTranscriptMarkdown([
        { role: "user", text: "go" },
        { role: "assistant", text: "   " },
        { role: "assistant", text: "done" },
      ]),
    ).toBe("## You\n\ngo\n\n## Assistant\n\ndone");
  });

  it("is empty for an empty thread", () => {
    expect(buildTranscriptMarkdown([])).toBe("");
  });

  it("labels system messages", () => {
    expect(buildTranscriptMarkdown([{ role: "system", text: "context" }])).toBe(
      "## System\n\ncontext",
    );
  });
});
