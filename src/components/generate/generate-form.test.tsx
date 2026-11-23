import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GenerateForm } from "./generate-form";

const createJob = vi.fn();
const addResource = vi.fn();
const generateUploadUrl = vi.fn();
const push = vi.fn();
const fetchMock = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (ref: { name: string }) => ({ createJob, addResource, generateUploadUrl })[ref.name],
}));
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    generation: {
      createJob: { name: "createJob" },
      addResource: { name: "addResource" },
      generateUploadUrl: { name: "generateUploadUrl" },
    },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  createJob.mockReset().mockResolvedValue("job1");
  addResource.mockReset().mockResolvedValue("res1");
  generateUploadUrl.mockReset().mockResolvedValue("https://upload.test/u");
  push.mockReset();
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("GenerateForm", () => {
  test("blocks an empty or too short topic without calling Convex", async () => {
    const user = userEvent.setup();
    render(<GenerateForm />);
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByText("Topic must be 3 to 200 characters.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Topic"), "ab");
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(createJob).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows the length preset and the three language labels", async () => {
    const user = userEvent.setup();
    render(<GenerateForm />);
    expect(screen.getByText("5 chapters, 3 subchapters each")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Length"), "long");
    expect(screen.getByText("8 chapters, 3-4 subchapters each")).toBeInTheDocument();
    const labels = Array.from(screen.getByLabelText("Language").querySelectorAll("option")).map((o) => o.textContent);
    expect(labels).toEqual(["English", "עברית", "Русский"]);
  });

  test("creates the job, saves resources, starts it and navigates", async () => {
    const user = userEvent.setup();
    render(<GenerateForm />);
    await user.type(screen.getByLabelText("Topic"), "Intro to RAG");
    await user.selectOptions(screen.getByLabelText("Language"), "he");
    await user.type(screen.getByLabelText("Web page URL"), "https://example.com/a");
    await user.click(screen.getByRole("button", { name: "Add URL" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "Intro to RAG", language: "he", level: "beginner", length: "medium" }),
    );
    expect(addResource).toHaveBeenCalledWith({ jobId: "job1", kind: "url", url: "https://example.com/a" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/course-builder/start",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ jobId: "job1" }) }),
    );
    expect(push).toHaveBeenCalledWith("/admin/generate/job1");
  });

  test("disables Generate while a request is in flight (no double submit)", async () => {
    const user = userEvent.setup();
    createJob.mockReturnValue(new Promise(() => {}));
    render(<GenerateForm />);
    await user.type(screen.getByLabelText("Topic"), "Intro to RAG");
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: "Starting..." })).toBeDisabled();
    expect(createJob).toHaveBeenCalledTimes(1);
  });

  test("an agent can find the controls and submit", async () => {
    const agent = createAgent();
    render(<GenerateForm />);
    const labels = agent.snapshot().filter((e) => !e.offPage).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Topic", "Generate"]));
    await act(async () => {
      const result = await agent.act({
        steps: [
          { ref: "Topic", action: "setValue", args: ["Intro to RAG"] },
          { ref: "Generate", action: "press" },
        ],
      });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect(createJob).toHaveBeenCalledTimes(1);
  });
});
