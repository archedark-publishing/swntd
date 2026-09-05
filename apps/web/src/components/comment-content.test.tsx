import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommentContent } from "./comment-content";

describe("comment formatting", () => {
  it("keeps newlines while rendering Markdown structure", () => {
    const html = renderToStaticMarkup(<CommentContent body={'First\nSecond\n\n**Bold**\n\n- One\n- Two'} />);
    expect(html).toContain("First\nSecond");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<li>One</li>");
  });
  it("does not execute raw HTML or javascript links", () => {
    const html = renderToStaticMarkup(<CommentContent body={'<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)'} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
  });
});
