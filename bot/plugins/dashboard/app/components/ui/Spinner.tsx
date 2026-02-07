/**
 * Spinner — reusable animated loading spinner.
 * Use anywhere we're awaiting data from the bot API.
 */

interface SpinnerProps {
  /** Size in Tailwind units (default: 8 = 2rem) */
  size?: string;
  /** Optional label shown below the spinner */
  label?: string;
}

export default function Spinner({ size = "h-8 w-8", label }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <svg className={`${size} animate-spin text-primary-500`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {label && <p className="text-sm text-zinc-400">{label}</p>}
    </div>
  );
}
