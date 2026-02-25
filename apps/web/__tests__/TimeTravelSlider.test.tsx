/**
 * Test Suite: TimeTravelSlider
 *
 * Tests slider navigation, prev/next buttons,
 * and correct photo selection callback behavior.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import TimeTravelSlider from "../src/components/foto360/TimeTravelSlider";

// ─── Test Data ───────────────────────────────────────────

const mockFotoList = [
  {
    id: "foto-1",
    url: "http://localhost/foto1.jpg",
    thumbnailUrl: "http://localhost/thumb1.jpg",
    timestamp: "2025-01-10T08:00:00Z",
  },
  {
    id: "foto-2",
    url: "http://localhost/foto2.jpg",
    thumbnailUrl: null,
    timestamp: "2025-02-15T12:00:00Z",
  },
  {
    id: "foto-3",
    url: "http://localhost/foto3.jpg",
    thumbnailUrl: null,
    timestamp: "2025-03-20T16:00:00Z",
  },
  {
    id: "foto-4",
    url: "http://localhost/foto4.jpg",
    thumbnailUrl: null,
    timestamp: "2025-04-25T09:30:00Z",
  },
  {
    id: "foto-5",
    url: "http://localhost/foto5.jpg",
    thumbnailUrl: null,
    timestamp: "2025-05-30T14:45:00Z",
  },
];

// ─── Test Suite ──────────────────────────────────────────

describe("TimeTravelSlider", () => {
  it("renderizza con lista di 5 foto mostrando l'indice corrente", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={2}
        onIndexChange={onIndexChange}
      />
    );

    // Should show "3 / 5" counter (currentIndex + 1)
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
    expect(screen.getByText("Time Travel")).toBeInTheDocument();
  });

  it("cambio slider → onIndexChange chiamato con indice corretto", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={0}
        onIndexChange={onIndexChange}
      />
    );

    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "4"); // length - 1

    // Change slider value to index 3
    fireEvent.change(slider, { target: { value: "3" } });
    expect(onIndexChange).toHaveBeenCalledWith(3);
  });

  it("navigazione next → incrementa indice", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={1}
        onIndexChange={onIndexChange}
      />
    );

    const buttons = screen.getAllByRole("button");
    const nextButton = buttons[1]; // Second button is "next"

    fireEvent.click(nextButton);
    expect(onIndexChange).toHaveBeenCalledWith(2); // 1 + 1
  });

  it("navigazione prev → decrementa indice", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={3}
        onIndexChange={onIndexChange}
      />
    );

    const buttons = screen.getAllByRole("button");
    const prevButton = buttons[0]; // First button is "prev"

    fireEvent.click(prevButton);
    expect(onIndexChange).toHaveBeenCalledWith(2); // 3 - 1
  });

  it("prev button disabilitato quando currentIndex === 0", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={0}
        onIndexChange={onIndexChange}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
  });

  it("next button disabilitato quando currentIndex è l'ultimo", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={4}
        onIndexChange={onIndexChange}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toBeDisabled();
  });

  it("prev clampato a 0 (non va sotto zero)", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={0}
        onIndexChange={onIndexChange}
      />
    );

    const buttons = screen.getAllByRole("button");
    // Even if we force-click, Math.max(0, -1) = 0
    fireEvent.click(buttons[0]);
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it("next clampato all'ultimo indice", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={4}
        onIndexChange={onIndexChange}
      />
    );

    const buttons = screen.getAllByRole("button");
    // Math.min(4, 5) = 4
    fireEvent.click(buttons[1]);
    expect(onIndexChange).toHaveBeenCalledWith(4);
  });

  it("mostra thumbnail quando disponibile", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={0} // foto-1 has thumbnailUrl
        onIndexChange={onIndexChange}
      />
    );

    const thumbnail = screen.getByAltText("Preview");
    expect(thumbnail).toBeInTheDocument();
    expect(thumbnail).toHaveAttribute("src", "http://localhost/thumb1.jpg");
  });

  it("non mostra thumbnail quando non disponibile", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={mockFotoList}
        currentIndex={1} // foto-2 has thumbnailUrl: null
        onIndexChange={onIndexChange}
      />
    );

    expect(screen.queryByAltText("Preview")).not.toBeInTheDocument();
  });

  it("mostra messaggio 'Nessuna foto disponibile' con lista vuota", () => {
    const onIndexChange = jest.fn();

    render(
      <TimeTravelSlider
        foto360List={[]}
        currentIndex={0}
        onIndexChange={onIndexChange}
      />
    );

    expect(screen.getByText("Nessuna foto disponibile")).toBeInTheDocument();
  });
});
