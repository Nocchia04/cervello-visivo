"use client";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

/**
 * Popup di conferma riutilizzabile. Overlay fisso su tutta la pagina con
 * messaggio e due pulsanti (conferma / annulla). Chiudibile cliccando fuori
 * o su Annulla.
 */
export default function ConfirmDialog({
  open,
  title = "Conferma",
  message,
  confirmLabel = "Sì, confermo",
  cancelLabel = "Annulla",
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ maxWidth: 400, width: "100%", padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: "var(--text)" }}>
          {title}
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn-primary"
            style={danger ? { background: "var(--danger)" } : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
