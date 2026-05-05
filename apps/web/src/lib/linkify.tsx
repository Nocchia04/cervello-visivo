import React from "react";

/**
 * Pattern per rilevare email, URL e numeri di telefono in un testo libero.
 * L'ordine importa: email PRIMA di URL (altrimenti `foo@bar.com` verrebbe
 * matchato come URL `bar.com`).
 *
 * Phone: per evitare false positive (date, codici, IP), riconosciamo solo:
 *   - Internazionale: `+XX...` con 6-15 cifre dopo il `+`
 *   - Mobile italiano: 10 cifre che iniziano con `3` (con/senza spazi o `-`)
 */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const TEL_RE = /(?:\+\d{1,3}[\s-]?[\d\s-]{6,15}\d|\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b)/;

const COMBINED = new RegExp(
  `(${EMAIL_RE.source})|(${URL_RE.source})|(${TEL_RE.source})`,
  "gi"
);

const LINK_STYLE: React.CSSProperties = {
  color: "#6366f1",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  wordBreak: "break-all",
};

/**
 * Trasforma testo libero in React nodes, sostituendo email/URL/telefoni
 * con anchor `<a>` cliccabili.
 *
 * - Email → `mailto:`
 * - URL (con o senza protocollo) → `https://...`, target=_blank
 * - Telefono → `tel:` (cifre normalizzate, senza spazi)
 *
 * Il click sul link fa `stopPropagation` per non chiudere il popup contenitore.
 */
export function linkify(text: string): React.ReactNode[] {
  if (!text) return [];

  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  COMBINED.lastIndex = 0;

  while ((match = COMBINED.exec(text)) !== null) {
    const [matched] = match;

    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }

    const isEmail = !!match[1];
    const isUrl = !match[1] && !!match[2];
    // isTel implicit: !match[1] && !match[2] && !!match[3]

    let href: string;
    let target: string | undefined;
    let rel: string | undefined;

    if (isEmail) {
      href = `mailto:${matched}`;
    } else if (isUrl) {
      href = matched.startsWith("http") ? matched : `https://${matched}`;
      target = "_blank";
      rel = "noopener noreferrer";
    } else {
      href = `tel:${matched.replace(/[\s-()]/g, "")}`;
    }

    out.push(
      <a
        key={`lnk-${match.index}-${matched.length}`}
        href={href}
        target={target}
        rel={rel}
        style={LINK_STYLE}
        onClick={(e) => e.stopPropagation()}
      >
        {matched}
      </a>
    );

    lastIndex = match.index + matched.length;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return out.length > 0 ? out : [text];
}
