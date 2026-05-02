import { readdir, stat, lstat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export async function crawl(outputDir) {
  const htmlFiles = []

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isSymbolicLink()) {
        let linkTarget
        try {
          linkTarget = await stat(fullPath)
        } catch {
          continue
        }
        if (linkTarget.isFile() && entry.name.endsWith('.html')) {
          htmlFiles.push(relative(outputDir, fullPath))
        }
      } else if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        htmlFiles.push(relative(outputDir, fullPath))
      }
    }
  }

  await walk(outputDir)
  return htmlFiles
    .map(p => p.replace(/\\/g, '/'))
    .sort()
}
