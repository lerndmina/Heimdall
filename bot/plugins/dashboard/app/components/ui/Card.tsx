/**
 * Card — glassmorphism container with backdrop blur and subtle borders.
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`group relative rounded-2xl border border-zinc-700/30 bg-zinc-900/40 p-6 shadow-lg backdrop-blur-xl transition-all duration-500 hover:shadow-2xl hover:border-zinc-600/40 ${className}`}>
      {/* Subtle hover gradient overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function CardHeader({ children, className = "" }: CardProps) {
  return <div className={`mb-4 flex items-center justify-between ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-lg font-semibold text-zinc-100 ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-zinc-400 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = "" }: CardProps) {
  return <div className={className}>{children}</div>;
}
