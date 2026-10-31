/**
 * Campos de data com limite de ano em 4 dígitos (sem `max`, o navegador aceita anos como 202727).
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "min" | "max">;

export function DateInput(props: Props) {
  return <input className="input" {...props} type="date" min="1900-01-01" max="9999-12-31" />;
}

export function DateTimeInput(props: Props) {
  return <input className="input" {...props} type="datetime-local" min="2000-01-01T00:00" max="9999-12-31T23:59" />;
}
