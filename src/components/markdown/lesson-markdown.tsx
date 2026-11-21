import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";
import { parseQuiz } from "./quiz";
import { QuizBlock } from "./quiz-block";

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

function QuizError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="my-6 rounded-xl border border-danger/50 bg-danger/10 p-4 text-sm text-danger"
    >
      This quiz block is invalid ({message}).
    </div>
  );
}

// The page owns the only <h1> (lesson or course title), so markdown headings shift down one level.
const shiftedHeadings = Object.fromEntries(
  (["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag, i) => {
    const Tag = (`h${Math.min(i + 2, 6)}`) as "h2";
    return [
      tag,
      (props: ComponentProps<"h2"> & { node?: unknown }) => {
        const rest = { ...props };
        delete rest.node; // react-markdown's hast node; not a DOM attribute
        return <Tag {...rest} />;
      },
    ];
  }),
) as Components;

const components: Components = {
  ...shiftedHeadings,
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    if (!isValidElement(child)) return <pre>{children}</pre>;
    const code = child as ReactElement<{ className?: string; children?: ReactNode }>;
    const language = /language-([\w-]+)/.exec(code.props.className ?? "")?.[1];
    const text = nodeText(code.props.children).replace(/\n$/, "");

    if (language === "quiz") {
      const parsed = parseQuiz(text);
      return parsed.ok ? <QuizBlock quiz={parsed.quiz} /> : <QuizError message={parsed.error} />;
    }
    return (
      <CodeBlock code={text} language={language}>
        {code.props.children}
      </CodeBlock>
    );
  },
  a({ href, children, ...props }) {
    const external = typeof href === "string" && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        {...props}
      >
        {children}
      </a>
    );
  },
};

/** Renders lesson markdown (GFM). Works on the server and in client components (e.g. admin preview). */
export function LessonMarkdown({ source }: { source: string }) {
  return (
    <div className="prose-lesson">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
