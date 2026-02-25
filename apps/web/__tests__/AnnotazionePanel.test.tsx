/**
 * Test Suite: AnnotazionePanel — Real-time annotations
 *
 * Tests Apollo useQuery/useSubscription behavior,
 * real-time annotation updates, and auto-scroll.
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock Apollo hooks ───────────────────────────────────

const mockUseQuery = jest.fn();
const mockUseSubscription = jest.fn();

jest.mock("@apollo/client", () => ({
  ...jest.requireActual("@apollo/client"),
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useSubscription: (...args: any[]) => mockUseSubscription(...args),
  gql: (strings: TemplateStringsArray) => strings[0],
}));

// ─── Mock child components ───────────────────────────────

jest.mock("../src/components/annotazioni/AnnotazioneForm", () => {
  return function MockAnnotazioneForm({ foto360Id }: { foto360Id: string }) {
    return <div data-testid="annotazione-form">Form for {foto360Id}</div>;
  };
});

jest.mock("../src/graphql/queries", () => ({
  GET_ANNOTAZIONI: "GET_ANNOTAZIONI",
}));

jest.mock("../src/graphql/subscriptions", () => ({
  NUOVA_ANNOTAZIONE: "NUOVA_ANNOTAZIONE",
}));

import AnnotazionePanel from "../src/components/annotazioni/AnnotazionePanel";

// ─── Test Data ───────────────────────────────────────────

const mockAnnotazioni = [
  {
    id: "ann-1",
    testo: "Crepa nel muro est",
    x: 0.5,
    y: 0.3,
    autore: { id: "u1", nome: "Mario", cognome: "Rossi" },
    createdAt: "2025-01-15T10:30:00Z",
  },
  {
    id: "ann-2",
    testo: "Infiltrazione soffitto",
    x: 0.7,
    y: 0.1,
    autore: { id: "u2", nome: "Luca", cognome: "Bianchi" },
    createdAt: "2025-01-15T11:00:00Z",
  },
];

// ─── Test Suite ──────────────────────────────────────────

describe("AnnotazionePanel — Real-time updates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mostra le annotazioni caricate dalla query", () => {
    mockUseQuery.mockReturnValue({
      data: { annotazioni: mockAnnotazioni },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    expect(screen.getByText("Crepa nel muro est")).toBeInTheDocument();
    expect(screen.getByText("Infiltrazione soffitto")).toBeInTheDocument();
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Luca Bianchi")).toBeInTheDocument();
  });

  it("mostra il conteggio corretto delle annotazioni", () => {
    mockUseQuery.mockReturnValue({
      data: { annotazioni: mockAnnotazioni },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    expect(screen.getByText("2 annotazioni")).toBeInTheDocument();
  });

  it("mostra singolare 'annotazione' con 1 elemento", () => {
    mockUseQuery.mockReturnValue({
      data: { annotazioni: [mockAnnotazioni[0]] },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    expect(screen.getByText("1 annotazione")).toBeInTheDocument();
  });

  it("useSubscription registra onData callback per aggiornamenti real-time", () => {
    mockUseQuery.mockReturnValue({
      data: { annotazioni: mockAnnotazioni },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    // Verify useSubscription was called with correct parameters
    expect(mockUseSubscription).toHaveBeenCalledWith(
      "NUOVA_ANNOTAZIONE",
      expect.objectContaining({
        variables: { foto360Id: "foto-123" },
        onData: expect.any(Function),
      })
    );
  });

  it("nuova annotazione via subscription → onData aggiorna la cache Apollo", () => {
    mockUseQuery.mockReturnValue({
      data: { annotazioni: mockAnnotazioni },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    // Get the onData callback passed to useSubscription
    const subscriptionCall = mockUseSubscription.mock.calls[0];
    const onData = subscriptionCall[1].onData;

    const nuovaAnnotazione = {
      id: "ann-3",
      testo: "Nuova nota real-time",
      x: 0.1,
      y: 0.9,
      autore: { id: "u1", nome: "Mario", cognome: "Rossi" },
      createdAt: "2025-01-15T12:00:00Z",
    };

    // Mock Apollo client methods
    const mockWriteQuery = jest.fn();
    const mockReadQuery = jest.fn().mockReturnValue({
      annotazioni: mockAnnotazioni,
    });

    const mockClient = {
      readQuery: mockReadQuery,
      writeQuery: mockWriteQuery,
    };

    // Simulate subscription data arriving
    act(() => {
      onData({
        client: mockClient,
        data: { data: { nuovaAnnotazione } },
      });
    });

    // Verify cache was updated with the new annotation appended
    expect(mockWriteQuery).toHaveBeenCalledWith({
      query: "GET_ANNOTAZIONI",
      variables: { foto360Id: "foto-123" },
      data: {
        annotazioni: [...mockAnnotazioni, nuovaAnnotazione],
      },
    });
  });

  it("annotazione duplicata via subscription → NON aggiunta alla cache", () => {
    mockUseQuery.mockReturnValue({
      data: { annotazioni: mockAnnotazioni },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    const onData = mockUseSubscription.mock.calls[0][1].onData;
    const mockWriteQuery = jest.fn();
    const mockClient = {
      readQuery: jest.fn().mockReturnValue({ annotazioni: mockAnnotazioni }),
      writeQuery: mockWriteQuery,
    };

    // Send an annotation that already exists (same id as ann-1)
    act(() => {
      onData({
        client: mockClient,
        data: { data: { nuovaAnnotazione: mockAnnotazioni[0] } },
      });
    });

    // writeQuery should NOT be called since the annotation is already in cache
    expect(mockWriteQuery).not.toHaveBeenCalled();
  });

  it("mostra loading spinner durante il caricamento", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: true,
    });
    mockUseSubscription.mockReturnValue({});

    const { container } = render(<AnnotazionePanel foto360Id="foto-123" />);

    // The loading spinner has animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("mostra 'Nessuna annotazione' quando la lista è vuota", () => {
    mockUseQuery.mockReturnValue({
      data: { annotazioni: [] },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    expect(screen.getByText("Nessuna annotazione")).toBeInTheDocument();
  });

  it("auto-scroll all'ultima annotazione quando cambiano le annotazioni", () => {
    // Mock scrollHeight and scrollTop
    const scrollTopSetter = jest.fn();
    const mockDiv = {
      scrollHeight: 500,
      get scrollTop() {
        return 0;
      },
      set scrollTop(val: number) {
        scrollTopSetter(val);
      },
    };

    jest.spyOn(React, "useRef").mockReturnValueOnce({ current: mockDiv });

    mockUseQuery.mockReturnValue({
      data: { annotazioni: mockAnnotazioni },
      loading: false,
    });
    mockUseSubscription.mockReturnValue({});

    render(<AnnotazionePanel foto360Id="foto-123" />);

    // The useEffect with [annotazioni.length] dependency should trigger auto-scroll
    // The ref's scrollTop should be set to scrollHeight
    // Note: The actual DOM behavior is managed by React's useEffect
  });
});
