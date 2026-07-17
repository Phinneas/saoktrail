// ErrorFallback.jsx - Reusable error boundary fallback for SolidJS components

export function ErrorFallback({ error, retry, message }) {
  const displayMessage = message || 'Something went wrong loading this section.';

  return (
    <div class="p-8 md:p-12 text-center">
      <div class="max-w-md mx-auto">
        <div class="fs-sign inline-block mb-6 px-6 py-3">
          <p class="text-xs uppercase tracking-[0.3em] text-black font-mono">
            System Fault
          </p>
        </div>

        <p class="text-black mb-2 leading-relaxed">
          {displayMessage}
        </p>

        {error && (
          <p class="text-xs text-black/60 font-mono mb-6 break-all">
            {error.message || String(error)}
          </p>
        )}

        {retry && (
          <button
            onClick={retry}
            class="px-6 py-3 bg-ds-button text-white hover:bg-ds-header transition-colors cursor-pointer"
          >
            TRY AGAIN
          </button>
        )}
      </div>
    </div>
  );
}
