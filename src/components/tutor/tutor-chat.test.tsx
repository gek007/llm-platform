import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import type { EveMessage, UseEveAgentReturn } from "eve/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TutorChat } from "./tutor-chat";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: async () => "tok" }),
}));

const mockUseEveAgent = vi.fn<() => UseEveAgentReturn>();

vi.mock("eve/react", () => ({
  useEveAgent: (...args: unknown[]) => {
    mockUseEveAgentCalls.push(args);
    return mockUseEveAgent();
  },
}));

const mockUseEveAgentCalls: unknown[][] = [];

function createMockAgent(
  overrides: Partial<UseEveAgentReturn> = {},
): UseEveAgentReturn {
  return {
    messages: [],
    status: "idle",
    error: undefined,
    view: {} as UseEveAgentReturn["view"],
    agents: {},
    events: [],
    session: undefined,
    send: vi.fn().mockResolvedValue({}),
    respond: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue(undefined),
    prewarm: vi.fn().mockResolvedValue({}),
    resume: vi.fn().mockResolvedValue(undefined),
    follow: vi.fn(),
    clear: vi.fn().mockResolvedValue({}),
    compact: vi.fn().mockResolvedValue({}),
    end: vi.fn().mockResolvedValue({}),
    newSession: vi.fn(),
    ...overrides,
  };
}

describe("TutorChat", () => {
  beforeEach(() => {
    mockUseEveAgentCalls.length = 0;
    mockUseEveAgent.mockReset();
    mockUseEveAgent.mockReturnValue(createMockAgent());
  });

  test("connects to the named learnly agent and sends starter prompts", async () => {
    const user = userEvent.setup();
    const agent = createMockAgent();
    mockUseEveAgent.mockReturnValue(agent);

    render(<TutorChat />);

    const options = mockUseEveAgentCalls[0][0] as { agent: string; auth: { bearer: () => Promise<string> } };
    expect(options.agent).toBe("learnly");
    expect(await options.auth.bearer()).toBe("tok");
    expect(screen.getByText("Ready to help")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Recommend a course" }),
    );
    expect(agent.send).toHaveBeenCalledWith(
      "Recommend a course I haven't done yet.",
    );
  });

  test("submits a typed message and clears the input", async () => {
    const user = userEvent.setup();
    const agent = createMockAgent();
    mockUseEveAgent.mockReturnValue(agent);

    render(<TutorChat />);

    const input = screen.getByRole("textbox", { name: "Message Learnly" });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    expect(sendButton).toBeDisabled();

    await user.type(input, "Tell me about accessibility");
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);
    expect(agent.send).toHaveBeenCalledWith("Tell me about accessibility");
    expect(input).toHaveValue("");
  });

  test("renders conversation messages, tool activity, cancel and reset controls", async () => {
    const user = userEvent.setup();
    const messages: EveMessage[] = [
      {
        id: "msg_1",
        role: "user",
        parts: [{ type: "text", text: "What courses exist?" }],
        metadata: {},
      },
      {
        id: "msg_2",
        role: "assistant",
        parts: [
          {
            type: "tool",
            callId: "call_1",
            stepIndex: 0,
            name: "list_courses",
            kind: "tool",
            label: "Browse course catalog",
            state: "completed",
            input: {},
            output: { count: 2 },
          },
          {
            type: "text",
            id: "text_1",
            text: "There are 2 published courses available.",
          },
        ],
        metadata: {},
      },
    ];

    const agent = createMockAgent({
      messages,
      status: "busy",
      error: new Error("Temporary network issue"),
    });
    mockUseEveAgent.mockReturnValue(agent);

    render(<TutorChat />);

    expect(screen.getByText("Learnly is thinking…")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Temporary network issue",
    );
    expect(screen.getByText("Browse course catalog")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(
      screen.getByText("There are 2 published courses available."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop response" }));
    expect(agent.cancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Start new chat" }));
    expect(agent.newSession).toHaveBeenCalledTimes(1);
  });

  test("omits empty assistant bubbles when a turn fails before emitting output", () => {
    const messages: EveMessage[] = [
      {
        id: "msg_1",
        role: "user",
        parts: [{ type: "text", text: "Hello Learnly" }],
        metadata: {},
      },
      {
        id: "msg_2",
        role: "assistant",
        parts: [],
        metadata: {},
      },
    ];

    mockUseEveAgent.mockReturnValue(
      createMockAgent({
        messages,
        error: new Error("Gateway billing required"),
      }),
    );

    render(<TutorChat />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Gateway billing required",
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Hello Learnly")).toBeInTheDocument();
  });

  test("a UI SDK agent can see and operate every control", async () => {
    const agent = createMockAgent();
    mockUseEveAgent.mockReturnValue(agent);
    const uiAgent = createAgent();

    render(<TutorChat />);

    const components = uiAgent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== "more");
    for (const entry of components) {
      expect(
        entry.label,
        `${entry.component} ${entry.ref} has no name`,
      ).toBeTruthy();
    }
    expect(components.map((entry) => entry.label)).toContain("Message Learnly");
    expect(components.map((entry) => entry.label)).toContain("Send message");

    const result = await uiAgent.act({
      steps: [
        {
          ref: "Message Learnly",
          action: "setValue",
          args: ["What beginner courses exist?"],
        },
        {
          ref: "Send message",
          action: "press",
        },
      ],
    });
    expect(result.ok, result.error?.message).toBe(true);
    expect(agent.send).toHaveBeenCalledWith("What beginner courses exist?");
  });
});

describe("TutorChat context and quizzes", () => {
  beforeEach(() => {
    mockUseEveAgentCalls.length = 0;
    mockUseEveAgent.mockReset();
  });

  test("shows lesson-aware suggestions and sends the page context with each turn", () => {
    mockUseEveAgent.mockReturnValue(createMockAgent());
    render(
      <TutorChat
        pageContext={{ pathname: "/courses/ts/lessons/intro", courseSlug: "ts", lessonSlug: "intro" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Explain this lesson" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quiz me" })).toBeInTheDocument();

    const options = mockUseEveAgentCalls[0][0] as {
      prepareSend: (p: { message?: string }) => { clientContext?: unknown };
    };
    expect(options.prepareSend({ message: "hi" }).clientContext).toEqual({
      pathname: "/courses/ts/lessons/intro",
      courseSlug: "ts",
      lessonSlug: "intro",
    });
    expect(options.prepareSend({}).clientContext).toBeUndefined();
  });

  test("renders a show_quiz tool result as an interactive quiz", () => {
    const messages: EveMessage[] = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool",
            callId: "c1",
            stepIndex: 0,
            name: "show_quiz",
            kind: "tool",
            label: "",
            state: "completed",
            input: {},
            output: {
              shown: true,
              quiz: { question: "What does tsc do?", options: ["Compiles", "Lints"], answer: 0 },
            },
          },
        ],
        metadata: {},
      },
    ];
    mockUseEveAgent.mockReturnValue(createMockAgent({ messages }));
    render(<TutorChat />);
    expect(screen.getByText("What does tsc do?")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
