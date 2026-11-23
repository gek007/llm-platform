import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { PDF_MAX_BYTES } from "../../../convex/lib/engineTypes";
import { ResourceInputs, type PendingResource } from "./resource-inputs";

function Harness() {
  const [resources, setResources] = useState<PendingResource[]>([]);
  return <ResourceInputs resources={resources} onChange={setResources} />;
}

describe("ResourceInputs", () => {
  test("adds and removes a URL, rejects an unsafe one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Web page URL"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Add URL" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid http(s) URL");
    await user.clear(screen.getByLabelText("Web page URL"));
    await user.type(screen.getByLabelText("Web page URL"), "https://example.com/a");
    await user.click(screen.getByRole("button", { name: "Add URL" }));
    expect(screen.getByText("URL: https://example.com/a")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Remove URL/ }));
    expect(screen.queryByText("URL: https://example.com/a")).not.toBeInTheDocument();
  });

  test("validates YouTube URLs and accepts pasted text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("YouTube URL"), "https://example.com/video");
    await user.click(screen.getByRole("button", { name: "Add YouTube" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid YouTube URL");
    await user.clear(screen.getByLabelText("YouTube URL"));
    await user.type(screen.getByLabelText("YouTube URL"), "https://youtu.be/dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Add YouTube" }));
    expect(screen.getByText(/YouTube: https:\/\/youtu.be/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Pasted text"), "some notes");
    await user.click(screen.getByRole("button", { name: "Add text" }));
    expect(screen.getByText("Text: some notes")).toBeInTheDocument();
  });

  test("rejects a PDF over 20 MB and accepts a small one", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: PDF_MAX_BYTES + 1 });
    await user.upload(screen.getByLabelText(/Upload PDF/), big);
    expect(screen.getByRole("alert")).toHaveTextContent("larger than 20 MB");
    expect(screen.queryByText("PDF: big.pdf")).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText(/Upload PDF/), new File(["x"], "ok.pdf", { type: "application/pdf" }));
    expect(screen.getByText("PDF: ok.pdf")).toBeInTheDocument();
  });
});
