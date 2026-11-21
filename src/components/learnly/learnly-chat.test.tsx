import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { LearnlyChat } from "./learnly-chat";

vi.mock("@/components/tutor/tutor-chat", () => ({
  TutorChat: () => <div>tutor chat</div>,
}));

describe("LearnlyChat", () => {
  test("renders the shared tutor chat", () => {
    render(<LearnlyChat />);
    expect(screen.getByText("tutor chat")).toBeInTheDocument();
  });
});
