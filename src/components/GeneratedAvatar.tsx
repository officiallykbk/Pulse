interface GeneratedAvatarProps {
  name?: string | null;
  className?: string;
}

const PALETTES = [
  ['#E50914', '#FF6B35'],
  ['#7C3AED', '#EC4899'],
  ['#2563EB', '#06B6D4'],
  ['#059669', '#84CC16'],
  ['#D97706', '#EF4444'],
] as const;

function hashName(name: string): number {
  return [...name.toLowerCase()].reduce((hash, character) =>
    (hash * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function getInitials(name?: string | null): string {
  const clean = (name || '').trim();
  if (!clean) return 'P';
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return 'P';
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
}

/** A stable, generated avatar that needs no upload or third-party image service. */
export function GeneratedAvatar({ name, className = '' }: GeneratedAvatarProps) {
  const safeName = (name || '').trim() || 'Pulse';
  const [start, end] = PALETTES[hashName(safeName) % PALETTES.length];

  return (
    <div
      role="img"
      aria-label={`${safeName} generated avatar`}
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${className}`}
      style={{ background: `linear-gradient(145deg, ${start}, ${end})` }}
    >
      <span aria-hidden="true" className="absolute -right-1/4 -top-1/4 h-3/4 w-3/4 rounded-full border-2 border-white/25" />
      <span aria-hidden="true" className="absolute -bottom-1/3 -left-1/4 h-3/4 w-3/4 rounded-full bg-white/10" />
      <span className="relative drop-shadow-sm">{getInitials(name)}</span>
    </div>
  );
}
