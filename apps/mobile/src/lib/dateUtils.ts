export function safeDate(val: string | number | null | undefined): Date {
  if (val === null || val === undefined || val === '') return new Date(0);
  if (typeof val === 'number') return new Date(val);
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== '') return new Date(n);
  return new Date(val);
}
