/**
 * No Access page — shown when a user navigates to a locked sidebar item.
 */
export default function NoAccessPage() {
  return (
    <div className="py-20 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700/30 bg-zinc-900/40 backdrop-blur-xl">
        <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-zinc-200">Access Denied</h2>
      <p className="mt-1 text-sm text-zinc-500">You don't have permission to access this feature. Contact a server administrator to request access.</p>
    </div>
  );
}
