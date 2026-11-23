import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { RegenerateDialog } from "./regenerate-dialog";

const fetchMock = vi.fn();
const target = { kind: "deck" as const, chapterOrder: 2 };

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

async function open(user: ReturnType<typeof userEvent.setup>) {
  render(<RegenerateDialog jobId="job1" target={target} label="Regenerate deck" />);
  await user.click(screen.getByRole("button", { name: "Regenerate deck" }));
}

describe("RegenerateDialog", () => {
  test("requires an instruction before it can submit", async () => {
    const user = userEvent.setup();
    await open(user);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    await user.type(screen.getByLabelText("Instruction"), "  ");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects an instruction over 500 characters", async () => {
    const user = userEvent.setup();
    await open(user);
    fireEvent.change(screen.getByLabelText("Instruction"), { target: { value: "x".repeat(501) } });
    expect(screen.getByText("501/500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  test("posts jobId, target and the trimmed instruction", async () => {
    const user = userEvent.setup();
    await open(user);
    await user.type(screen.getByLabelText("Instruction"), " Add more examples ");
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/course-builder/regenerate");
    expect(JSON.parse(init.body as string)).toEqual({ jobId: "job1", target, instruction: "Add more examples" });
  });

  test("shows the published-course refusal from a 409", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unpublish the course to regenerate", status: "ready" }), { status: 409 }),
    );
    const user = userEvent.setup();
    await open(user);
    await user.type(screen.getByLabelText("Instruction"), "Shorter");
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Unpublish the course to regenerate")).toBeInTheDocument();
  });
});
