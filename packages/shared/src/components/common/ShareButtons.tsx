import React, { useCallback } from "react";

interface ShareButtonsProps {
  url?: string;
  title?: string;
  description?: string;
}

const ShareButtons: React.FC<ShareButtonsProps> = ({
  url,
  title = "",
  description = "",
}) => {
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");
  const shareTitle = title || (typeof window !== "undefined" ? document.title : "");
  const text = encodeURIComponent(`${shareTitle} — ${shareUrl}`);
  const blueskyUrl = `https://bsky.app/intent/compose?text=${text}`;

  const handleMastodonShare = useCallback(() => {
    const instance = prompt("Enter your Mastodon instance (e.g., mastodon.social):");
    if (!instance) return;
    const cleanInstance = instance.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const mastodonUrl = `https://${cleanInstance}/share?text=${text}`;
    window.open(mastodonUrl, "_blank", "noopener,noreferrer");
  }, [text]);

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      const label = document.getElementById("copy-label");
      if (label) {
        const original = label.textContent;
        label.textContent = "Copied!";
        setTimeout(() => {
          if (label) label.textContent = original;
        }, 2000);
      }
    }).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      const label = document.getElementById("copy-label");
      if (label) {
        const original = label.textContent;
        label.textContent = "Copied!";
        setTimeout(() => {
          if (label) label.textContent = original;
        }, 2000);
      }
    });
  }, [shareUrl]);

  return (
    <div className="flex items-center gap-3 mt-6 pt-6 border-t border-border dark:border-darkmode-border">
      <span className="text-sm text-txt-light dark:text-darkmode-txt-light font-primary">Share:</span>

      <a
        href={blueskyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 bg-[#0560ff] text-white text-sm font-medium rounded-sm hover:bg-[#044bd1] transition-colors"
        aria-label="Share on Bluesky"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944.331 1.862.441 4.078c.222 4.463 4.977 7.625 8.139 8.695C5.617 14.002.086 16.503.005 20.17c-.094 4.392 5.396 2.726 7.878.67C10.783 19.266 12 17.492 12 17.492s1.217 1.774 4.117 3.348c2.482 2.056 7.972 3.722 7.878-.67-.081-3.667-5.612-6.168-8.575-7.397 3.162-1.07 7.917-4.232 8.139-8.695.11-2.216-2.125-1.134-4.762 2.727C17.046 6.747 13.087 10.686 12 10.8z"/>
        </svg>
        Bluesky
      </a>

      <button
        type="button"
        onClick={handleMastodonShare}
        className="inline-flex items-center gap-2 px-3 py-2 bg-[#6364ff] text-white text-sm font-medium rounded-sm hover:bg-[#4f50cc] transition-colors"
        aria-label="Share on Mastodon"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.193 7.879c0-5.206-3.411-6.732-3.411-6.732C18.062.357 15.108.025 12.041 0h-.076c-3.067.025-6.021.357-7.74 1.147 0 0-3.411 1.526-3.411 6.732 0 1.192-.023 2.618.014 4.129.118 4.646.883 9.216 5.331 10.355 2.049.537 3.808.65 5.227.572 2.57-.143 4.014-.92 4.014-.92l-.085-1.869s-1.837.58-3.899.51c-2.048-.07-4.21-.219-4.541-2.713-.029-.21-.043-.428-.043-.653 0 0 2.01.495 4.56.612 1.558.075 3.021-.098 4.505-.288 2.848-.34 5.327-2.095 5.635-3.702.489-2.56.45-6.248.45-6.248zM19.517 14.16h-2.388V8.29c0-1.24-.52-1.87-1.558-1.87-1.148 0-1.724.743-1.724 2.216v3.24h-2.374V8.636c0-1.473-.576-2.216-1.724-2.216-1.038 0-1.558.63-1.558 1.87v5.87H6.803V8.142c0-1.239.315-2.222.946-2.947.652-.726 1.505-1.099 2.562-1.099 1.224 0 2.15.47 2.757 1.411l.593.993.593-.993c.607-.94 1.533-1.411 2.757-1.411 1.057 0 1.91.373 2.562 1.099.631.725.946 1.708.946 2.947v6.018z"/>
        </svg>
        Mastodon
      </button>

      <button
        type="button"
        onClick={handleCopyLink}
        className="inline-flex items-center gap-2 px-3 py-2 border border-border dark:border-darkmode-border text-txt-p dark:text-darkmode-txt-p text-sm font-medium rounded-sm hover:bg-bg-s dark:hover:bg-darkmode-bg-s transition-colors"
        aria-label="Copy link to clipboard"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span id="copy-label">Copy link</span>
      </button>
    </div>
  );
};

export default ShareButtons;
