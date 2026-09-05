import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function CommentContent({ body }: { body: string }) {
  return (
    <div className="comment-content">
      <Markdown remarkPlugins={[remarkGfm]} components={{
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>
      }}>{body}</Markdown>
    </div>
  );
}
