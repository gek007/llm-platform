import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { JobLiveView } from "./job-live-view";

const data: Record<string, unknown> = {};
const fetchMock = vi.fn();

vi.mock("@/components/admin/use-admin-query", () => ({
  useAdminQuery: (ref: { name: string }) => data[ref.name],
}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    generation: {
      get: { name: "get" },
      events: { name: "events" },
      sources: { name: "sources" },
      updateOutline: { name: "updateOutline" },
    },
  },
}));

const outline = {
  chapters: [
    { title: "Basics", goal: "g", subchapters: [{ title: "Intro", goal: "g" }] },
    { title: "Deep", goal: "g", subchapters: [{ title: "Tune", goal: "g" }] },
  ],
};
const baseJob = { _id: "job1", topic: "RAG", language: "en", status: "queued", outline: undefined };

function setJob(extra: Record<string, unknown>) {
  data.get = { ...baseJob, ...extra };
}
const retry = () => screen.queryByRole("button", { name: "Retry phase" });
const resume = () => screen.queryByRole("button", { name: "Resume" });

beforeEach(() => {
  for (const key of Object.keys(data)) delete data[key];
  data.events = [];
  data.sources = [];
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("JobLiveView", () => {
  test("loading state while the job is undefined", () => {
    data.get = undefined;
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByText("Loading job...")).toBeInTheDocument();
  });

  test("queued: waiting, Start available", async () => {
    const user = userEvent.setup();
    setJob({ status: "queued" });
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByText(/Waiting to start/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/course-builder/start", expect.anything());
  });

  test("researching: stepper at Research, feed and sources, no controls", () => {
    setJob({ status: "researching" });
    data.events = [{ _id: "e1", at: 1, kind: "info", message: "Reading sources" }];
    data.sources = [{ _id: "s1", url: "https://a.dev/x", title: "Doc A", kind: "web" }];
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByText("Research").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Reading sources")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Doc A" })).toHaveAttribute("href", "https://a.dev/x");
    expect(retry()).toBeNull();
    expect(resume()).toBeNull();
  });

  test("outline_ready: shows the outline editor with Approve", () => {
    setJob({ status: "outline_ready", outline });
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByText("Outline").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("Chapter 1 title")).toHaveValue("Basics");
    expect(screen.getByRole("button", { name: "Approve and write" })).toBeInTheDocument();
  });

  test("writing: per-chapter cards with the latest chapter event", () => {
    setJob({ status: "writing", outline });
    data.events = [{ _id: "e1", at: 1, kind: "chapter", message: "Wrote Basics", chapterOrder: 1 }];
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByText("Writing").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: /Chapter 1: Basics/ })).toBeInTheDocument();
    expect(screen.getAllByText("Wrote Basics")).toHaveLength(2); // feed + card
    expect(screen.getByText("Waiting")).toBeInTheDocument(); // chapter 2
  });

  test("ready: links to the draft course", () => {
    setJob({ status: "ready", outline, courseId: "course9" });
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByRole("link", { name: "Open draft course" })).toHaveAttribute("href", "/admin/courses/course9");
  });

  test("failed: shows the error and Retry phase posting /resume", async () => {
    const user = userEvent.setup();
    setJob({ status: "failed", error: "Agent stalled" });
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByText("Agent stalled")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry phase" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/course-builder/resume", expect.anything());
  });

  test("dispatchError: shows Resume", async () => {
    const user = userEvent.setup();
    setJob({ status: "researching", dispatchError: "engine down" });
    render(<JobLiveView jobId="job1" />);
    expect(screen.getByText(/engine down/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/course-builder/resume", expect.anything());
  });

  test("a 409 shows the current status and the button re-enables", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "BAD_STATE", status: "writing" }), { status: 409 }));
    setJob({ status: "failed", error: "x" });
    render(<JobLiveView jobId="job1" />);
    await user.click(screen.getByRole("button", { name: "Retry phase" }));
    expect(await screen.findByText(/already writing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry phase" })).toBeEnabled();
  });

  test("the button is disabled while its request is in flight", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise(() => {}));
    setJob({ status: "failed", error: "x" });
    render(<JobLiveView jobId="job1" />);
    await user.click(screen.getByRole("button", { name: "Retry phase" }));
    expect(screen.getByRole("button", { name: "Retry phase" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
