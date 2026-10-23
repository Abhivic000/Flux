/**
 * Public base URL, used for metadata, the sitemap and social previews.
 * Set NEXT_PUBLIC_SITE_URL for a custom domain; on Vercel the production URL is used
 * automatically.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3002");

export const SITE_NAME = "Flux";
export const SITE_DESCRIPTION =
  "A browser instrument for generative, audio-reactive art. Every piece is reproducible from its link.";
