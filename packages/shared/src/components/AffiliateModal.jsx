/**
 * AffiliateModal.jsx — Context-aware affiliate product modal.
 *
 * Desktop: exit-intent (mouse leaves top of viewport) → centered modal.
 * Mobile: scroll-depth (70%) → slide-up bottom sheet.
 * Frequency: once per 24 hours (localStorage).
 * Products: shuffled with context-aware weighting from affiliateProducts.ts.
 *
 * Self-activates only on allowed URL patterns; returns null on excluded pages.
 * Solid.js component, hydrated with client:load.
 */

import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import {
  getRandomProducts,
  getContextHints,
  DISCLOSURE,
} from '../lib/affiliateProducts';

const STORAGE_KEY = 'soaktrail_affiliate_modal_shown';
const FREQUENCY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Pages where modal is ALLOWED
const MODAL_ON_PATTERNS = [
  /^\/blog$/,
  /^\/blog\//,
  /^\/directory$/,
  /^\/about$/,
  /^\/minerals/,
  /^\/trip-planner/,
  /^\/itineraries/,
];

// Pages where modal is EXPLICITLY blocked
const MODAL_OFF_EXACT = new Set(['/', '/map']);
const MODAL_OFF_PATTERNS = [/^\/springs\//];

function shouldShowModal(pathname) {
  if (MODAL_OFF_EXACT.has(pathname)) return false;
  if (MODAL_OFF_PATTERNS.some((p) => p.test(pathname))) return false;
  return MODAL_ON_PATTERNS.some((p) => p.test(pathname));
}

function hasRecentDismissal() {
  try {
    const ts = localStorage.getItem(STORAGE_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts) < FREQUENCY_MS;
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  } catch {}
}

export function AffiliateModal() {
  const [visible, setVisible] = createSignal(false);
  const [products, setProducts] = createSignal([]);
  let triggered = false;

  const isMobile = () =>
    typeof window !== 'undefined' && window.innerWidth < 768;

  const showModal = () => {
    if (triggered || hasRecentDismissal()) return;

    const pathname = window.location.pathname;
    const pageAttrs = {};
    const mainEl = document.querySelector('[data-affiliate-categories]');
    if (mainEl) {
      pageAttrs.affiliateCategories =
        mainEl.getAttribute('data-affiliate-categories') || '';
    }

    const hints = getContextHints(pathname, pageAttrs);
    const picks = getRandomProducts(4, hints);
    if (picks.length === 0) return; // No products — don't show empty modal

    triggered = true;
    setProducts(picks);
    setVisible(true);
  };

  const closeModal = () => {
    setVisible(false);
    setDismissed();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape' && visible()) closeModal();
  };

  onMount(() => {
    const pathname = window.location.pathname;
    if (!shouldShowModal(pathname)) return;
    if (hasRecentDismissal()) return;

    document.addEventListener('keydown', handleKey);

    if (isMobile()) {
      // Mobile: scroll-depth trigger at 70%
      const onScroll = () => {
        if (triggered) return;
        const scrolled = window.scrollY;
        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll > 0 && scrolled / maxScroll >= 0.7) {
          showModal();
          window.removeEventListener('scroll', onScroll);
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onCleanup(() => window.removeEventListener('scroll', onScroll));
    } else {
      // Desktop: exit-intent trigger
      const onMouseLeave = (e) => {
        if (triggered) return;
        // Only trigger when mouse leaves the top of the viewport
        if (e.clientY <= 0) {
          showModal();
          document.removeEventListener('mouseleave', onMouseLeave);
        }
      };
      document.addEventListener('mouseleave', onMouseLeave);
      onCleanup(() => document.removeEventListener('mouseleave', onMouseLeave));
    }
  });

  onCleanup(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKey);
    }
  });

  return (
    <Show when={visible()}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        {/* Desktop: centered modal */}
        <div
          class="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full p-6 md:p-8 border border-zinc-200 dark:border-zinc-700"
          role="dialog"
          aria-modal="true"
          aria-label="Recommended gear"
        >
          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="text-xl font-bold text-zinc-900 dark:text-white">
                Planning your soak?
              </h2>
              <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Here's the gear we trust.
              </p>
            </div>
            <button
              onClick={closeModal}
              class="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3 mb-4">
            <For each={products()}>
              {(p) => (
                <a
                  href={p.url}
                  target="_blank"
                  rel="sponsored nofollow noopener"
                  class="block p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:shadow-md transition-all group"
                >
                  <span class="block font-semibold text-sm text-zinc-900 dark:text-white group-hover:text-blue-600">
                    {p.name}
                  </span>
                  <span class="block text-xs text-zinc-500 dark:text-zinc-400 leading-snug mt-1">
                    {p.description}
                  </span>
                  <span class="block text-xs font-bold text-blue-600 mt-2">
                    View product →
                  </span>
                </a>
              )}
            </For>
          </div>

          <p class="text-[11px] text-zinc-400 dark:text-zinc-500">{DISCLOSURE}</p>
        </div>

        {/* Mobile: slide-up bottom sheet */}
        <div
          class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 rounded-t-2xl shadow-2xl p-5 pb-8 border-t border-zinc-200 dark:border-zinc-700"
          role="dialog"
          aria-modal="true"
          aria-label="Recommended gear"
        >
          <div class="flex items-start justify-between mb-3">
            <div>
              <h2 class="text-lg font-bold text-zinc-900 dark:text-white">
                Planning your soak?
              </h2>
              <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Here's the gear we trust.
              </p>
            </div>
            <button
              onClick={closeModal}
              class="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2.5 mb-3">
            <For each={products()}>
              {(p) => (
                <a
                  href={p.url}
                  target="_blank"
                  rel="sponsored nofollow noopener"
                  class="block p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 active:bg-zinc-50 dark:active:bg-zinc-800 transition-all"
                >
                  <span class="block font-semibold text-xs text-zinc-900 dark:text-white">
                    {p.name}
                  </span>
                  <span class="block text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-1">
                    {p.description}
                  </span>
                  <span class="block text-[11px] font-bold text-blue-600 mt-1.5">
                    View product →
                  </span>
                </a>
              )}
            </For>
          </div>

          <p class="text-[10px] text-zinc-400 dark:text-zinc-500">{DISCLOSURE}</p>
        </div>
      </div>
    </Show>
  );
}
