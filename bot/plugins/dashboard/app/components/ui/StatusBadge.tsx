/**
 * StatusBadge — colored pill for displaying status values.
 */

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  error: "bg-red-500/15 text-red-400 border-red-500/20",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  neutral: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

interface StatusBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function StatusBadge({ variant = "neutral", children, className = "" }: StatusBadgeProps) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}>{children}</span>;
}
