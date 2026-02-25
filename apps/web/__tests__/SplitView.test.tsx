/**
 * Test Suite: SplitView — Scroll sincronizzato bidirezionale
 *
 * TEST CRITICO DoD: "scroll di foto A si riflette su foto B in tempo reale"
 *
 * Uses Jest + React Testing Library to verify synchronized
 * scroll behavior between two Viewer360 panels.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock Viewer360 ──────────────────────────────────────

// We mock Viewer360 to expose scroll behavior without requiring
// actual image rendering or canvas operations.

let leftSetScroll: jest.Mock;
let rightSetScroll: jest.Mock;
let leftOnScroll: ((scrollLeft: number, scrollTop: number) => void) | undefined;
let rightOnScroll: ((scrollLeft: number, scrollTop: number) => void) | undefined;
let viewerCount = 0;

jest.mock("../src/components/foto360/Viewer360", () => {
  const { forwardRef, useImperativeHandle } = require("react");

  const MockViewer360 = forwardRef(function MockViewer360(
    props: { url: string; zoom: number; onScroll?: (sl: number, st: number) => void },
    ref: any
  ) {
    const instanceId = viewerCount++;
    const setScrollMock = jest.fn();

    // Expose setScrollPosition via ref
    useImperativeHandle(ref, () => ({
      getScrollPosition: () => ({ scrollLeft: 0, scrollTop: 0 }),
      setScrollPosition: setScrollMock,
    }));

    // Track which panel this is (left=0, right=1)
    if (instanceId % 2 === 0) {
      leftSetScroll = setScrollMock;
      leftOnScroll = props.onScroll;
    } else {
      rightSetScroll = setScrollMock;
      rightOnScroll = props.onScroll;
    }

    return (
      <div data-testid={`viewer-${instanceId % 2 === 0 ? "left" : "right"}`}>
        <img src={props.url} alt="Foto 360" />
      </div>
    );
  });

  MockViewer360.displayName = "Viewer360";

  return {
    __esModule: true,
    default: MockViewer360,
    Viewer360Handle: {},
  };
});

import SplitView from "../src/components/foto360/SplitView";

// ─── Test Data ───────────────────────────────────────────

const mockFotoList = [
  {
    id: "foto-1",
    url: "http://localhost/foto1.jpg",
    thumbnailUrl: null,
    timestamp: "2025-01-15T10:00:00Z",
  },
  {
    id: "foto-2",
    url: "http://localhost/foto2.jpg",
    thumbnailUrl: null,
    timestamp: "2025-02-20T14:30:00Z",
  },
  {
    id: "foto-3",
    url: "http://localhost/foto3.jpg",
    thumbnailUrl: null,
    timestamp: "2025-03-10T09:15:00Z",
  },
];

// ─── Test Suite ──────────────────────────────────────────

describe("SplitView — Scroll Sincronizzato", () => {
  beforeEach(() => {
    viewerCount = 0;
  });

  it("renderizza due pannelli Viewer360 con foto diverse", () => {
    render(<SplitView foto360List={mockFotoList} />);

    const leftViewer = screen.getByTestId("viewer-left");
    const rightViewer = screen.getByTestId("viewer-right");

    expect(leftViewer).toBeInTheDocument();
    expect(rightViewer).toBeInTheDocument();
  });

  it("scroll su pannello sinistro → aggiorna pannello destro (sync attivo)", () => {
    render(<SplitView foto360List={mockFotoList} />);

    // Simulate scroll on left panel
    if (leftOnScroll) {
      leftOnScroll(150, 200);
    }

    // Right panel should receive the same scroll position
    expect(rightSetScroll).toHaveBeenCalledWith(150, 200);
  });

  it("scroll su pannello destro → aggiorna pannello sinistro (sync attivo)", () => {
    render(<SplitView foto360List={mockFotoList} />);

    // Simulate scroll on right panel
    if (rightOnScroll) {
      rightOnScroll(300, 100);
    }

    // Left panel should receive the same scroll position
    expect(leftSetScroll).toHaveBeenCalledWith(300, 100);
  });

  it("disabilita sync → scroll indipendente tra i pannelli", () => {
    render(<SplitView foto360List={mockFotoList} />);

    // Find and uncheck the sync checkbox
    const syncCheckbox = screen.getByRole("checkbox");
    expect(syncCheckbox).toBeChecked(); // Default: sync is enabled

    fireEvent.click(syncCheckbox);
    expect(syncCheckbox).not.toBeChecked();

    // Reset mocks after re-render
    rightSetScroll.mockClear();
    leftSetScroll.mockClear();

    // Scroll on left panel should NOT propagate to right
    if (leftOnScroll) {
      leftOnScroll(100, 50);
    }
    expect(rightSetScroll).not.toHaveBeenCalled();
  });

  it("mostra messaggio se meno di 2 foto disponibili", () => {
    const singleFoto = [mockFotoList[0]];
    render(<SplitView foto360List={singleFoto} />);

    expect(
      screen.getByText("Servono almeno 2 foto per la vista comparativa")
    ).toBeInTheDocument();
  });

  it("i selettori data mostrano tutte le foto disponibili", () => {
    render(<SplitView foto360List={mockFotoList} />);

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);

    // Each select should have 3 options
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(6); // 3 per select × 2 selects
  });
});
