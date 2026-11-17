export function formatInrCompact(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  }
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

export function formatInrFull(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatIstDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function titleize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  'hi-Latn': 'Hinglish',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  mr: 'Marathi (मराठी)',
  kn: 'Kannada (ಕನ್ನಡ)',
  gu: 'Gujarati (ગુજરાતી)',
};
