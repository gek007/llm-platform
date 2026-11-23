import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { RTL_LANGUAGES, type Language } from "../../../convex/lib/engineTypes";
import { CodeBlock } from "./code-block";
import { parseResourceBlock, parseYoutubeBlock } from "./embeds";
import { parseQuiz } from "./quiz";
import { QuizBlock } from "./quiz-block";
import { ResourceCard } from "./resource-card";
import { YoutubeEmbed } from "./youtube-embed";

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

function BlockError({ kind, message }: { kind: string; message: string }) {
  return (
    <div
      role="alert"
      className="my-6 rounded-xl border border-danger/50 bg-danger/10 p-4 text-sm text-danger"
    >
      This {kind} block is invalid ({message}).
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

function Pre({ children, rtl }: ComponentProps<"pre"> & { rtl?: boolean }) {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement(child)) return <pre>{children}</pre>;
  const code = child as ReactElement<{ className?: string; children?: ReactNode }>;
  const language = /language-([\w-]+)/.exec(code.props.className ?? "")?.[1];
  const text = nodeText(code.props.children).replace(/\n$/, "");

  if (language === "quiz") {
    const parsed = parseQuiz(text);
    return parsed.ok ? <QuizBlock quiz={parsed.quiz} /> : <BlockError kind="quiz" message={parsed.error} />;
  }
  if (language === "youtube") {
    const parsed = parseYoutubeBlock(text);
    return parsed.ok ? <YoutubeEmbed embed={parsed.embed} /> : <BlockError kind="youtube" message={parsed.error} />;
  }
  if (language === "resource") {
    const parsed = parseResourceBlock(text);
    return parsed.ok ? <ResourceCard resourceId={parsed.resourceId} /> : <BlockError kind="resource" message={parsed.error} />;
  }
  const block = (
    <CodeBlock code={text} language={language}>
      {code.props.children}
    </CodeBlock>
  );
  return rtl ? <div dir="ltr">{block}</div> : block;
}

const components: Components = {
  ...shiftedHeadings,
  pre: Pre,
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

// Inside an RTL container paragraphs and list items pick their own direction (mixed Hebrew/English)
// and code is always left-to-right.
const rtlComponents: Components = {
  ...components,
  p: ({ node, ...props }) => {
    void node;
    return <p dir="auto" {...props} />;
  },
  li: ({ node, ...props }) => {
    void node;
    return <li dir="auto" {...props} />;
  },
  pre: ({ node, ...props }) => {
    void node;
    return <Pre rtl {...props} />;
  },
};

/**
 * Renders lesson markdown (GFM). Works on the server and in client components (e.g. admin preview).
 * `language="he"` renders the content right-to-left; any other value renders as before.
 */
export function LessonMarkdown({ source, language }: { source: string; language?: Language }) {
  const rtl = language !== undefined && RTL_LANGUAGES.includes(language);
  return (
    <div className="prose-lesson" {...(rtl ? { dir: "rtl", lang: language } : {})}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={rtl ? rtlComponents : components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
