import { cn } from "@/lib/utils/cn";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
};

// Eight-tint deterministic palette. Chosen so initials remain readable
// on the bg and so adjacent avatars don't look like a stripe.
const PALETTE = [
  "bg-indigo-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-rose-500 text-white",
  "bg-sky-500 text-white",
  "bg-violet-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-teal-500 text-white",
] as const;

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  if (email) return email[0]!.toUpperCase();
  return "?";
}

export function Avatar({
  userId,
  name,
  email,
  size = "sm",
  className,
}: {
  userId: string;
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const initials = initialsFrom(name, email);
  const palette = PALETTE[hash(userId) % PALETTE.length]!;
  const label = name ?? email ?? initials;
  return (
    <span
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full font-medium",
        SIZE_CLASSES[size],
        palette,
        className,
      )}
      aria-label={label}
      title={label}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 3,
  size = "sm",
}: {
  users: { id: string; name?: string | null; email?: string | null }[];
  max?: number;
  size?: AvatarSize;
}) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((u) => (
        <Avatar
          key={u.id}
          userId={u.id}
          name={u.name}
          email={u.email}
          size={size}
          className="ring-2 ring-white"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            SIZE_CLASSES[size],
            "inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-700 ring-2 ring-white",
          )}
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
