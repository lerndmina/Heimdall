/**
 * Login page — Discord OAuth sign-in.
 */
"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-125 w-125 animate-pulse rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute -right-[10%] -bottom-[10%] h-125 w-125 animate-pulse rounded-full bg-primary-600/10 blur-3xl animation-delay-2000" />
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Card */}
        <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-xl">
          {/* Logo/Icon */}
          <div className="mb-8 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/50">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">Heimdall Dashboard</h1>
            <p className="text-sm text-zinc-400">Sign in with Discord to manage your servers</p>
          </div>

          {/* Sign in button */}
          <button
            onClick={() => signIn("discord", { callbackUrl: "/" })}
            className="group relative w-full overflow-hidden rounded-lg bg-[#5865F2] px-6 py-3.5 font-medium text-white shadow-lg shadow-[#5865F2]/25 transition-all hover:shadow-xl hover:shadow-[#5865F2]/40 active:scale-[0.98]">
            <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <span className="relative flex items-center justify-center gap-3">
              <svg className="h-5 w-5" viewBox="0 0 127.14 96.36" fill="currentColor">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
              </svg>
              Sign in with Discord
            </span>
          </button>

          {/* Features list */}
          <div className="mt-8 space-y-3 border-t border-zinc-800/50 pt-6">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-zinc-400">Manage all your Discord servers in one place</p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-zinc-400">Configure plugins and features with ease</p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-zinc-400">Monitor activity and analytics in real-time</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-500">By signing in, you agree to our Terms of Service and Privacy Policy</p>
      </div>
    </main>
  );
}
