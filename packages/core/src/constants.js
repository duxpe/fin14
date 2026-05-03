export const BYTES_PER_KB = 1000
export const MILLISECONDS_PER_SECOND = 1000

export const DEFAULT_CONFIG = {
  project: { output_dir: null, build_command: null },
  budget: {
    default: 14000,
    compression: 'gzip',
    compression_level: 6,
    cut_candidate_min_bytes: 2800,
  },
  network: { timeout_ms: 5000, max_redirects: 5 },
  viewport: {
    default: 'mobile',
    mobile: { width: 390, height: 844, lazy_visible_images: 1 },
    desktop: { width: 1366, height: 768, lazy_visible_images: 1 },
  },
  warnings: { exclude: [] },
}

export const STRICT_IPV6_LIMIT_BYTES = 12200

export const SITE_PAGE_BATCH_SIZE = 50
export const SITE_EMFILE_RETRY_BATCH_SIZE = 10
export const SUMMARY_TOP_ASSET_LIMIT = 10

export const EXTERNAL_CACHE_TTL_SECONDS = 3600
export const EXTERNAL_DOMAIN_CONCURRENCY = 10
export const EXTERNAL_DOMAIN_WAIT_MS = 50
