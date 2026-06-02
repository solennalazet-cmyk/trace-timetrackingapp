import { writeFileSync } from "fs"
import { resolve } from "path"

const BASE_URL = "https://trace.lla-studio.com"

interface SitemapEntry {
  path: string
  lastmod?: string
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"
  priority?: string
}

const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/reports", changefreq: "weekly", priority: "0.8" },
  { path: "/timeline", changefreq: "daily", priority: "0.8" },
  { path: "/clients", changefreq: "weekly", priority: "0.7" },
  { path: "/employer", changefreq: "weekly", priority: "0.7" },
  { path: "/workers", changefreq: "weekly", priority: "0.7" },
  { path: "/payments", changefreq: "weekly", priority: "0.7" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
]

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  )

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n")
}

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries))
console.log(`sitemap.xml written (${entries.length} entries)`)
