import { readFile } from 'node:fs/promises'
import { compress } from '../compress.js'
import { fetchExternal } from './external.js'

const MISSING_CODE = {
  css: 'E06',
  js: 'E07',
  image: 'E08',
  font: 'E08',
}

export async function measure(refs, config) {
  const results = []
  const warnings = []
  let unknownBudget = false

  for (const ref of refs) {
    let bytes

    if (ref.inline) {
      bytes = compress(ref.inlineContent, config.budget)
    } else if (ref.external) {
      try {
        const { body } = await fetchExternal(ref.path, config)
        bytes = compress(body, config.budget)
      } catch {
        warnings.push({
          code: 'E09',
          message: `${ref.displayPath}: fetch failed — budget unknown`,
          path: ref.path,
          strictFailure: false,
        })
        warnings.push({
          code: 'E19',
          message: `unknown budget: fetch failed for ${ref.displayPath}`,
          path: ref.path,
          strictFailure: true,
        })
        unknownBudget = true
        continue
      }
    } else {
      try {
        const content = await readFile(ref.path)
        bytes = compress(content, config.budget)
      } catch (err) {
        if (err.code === 'ENOENT') {
          const code = MISSING_CODE[ref.type]
          if (code) {
            warnings.push({
              code,
              message: `${ref.displayPath}: file not found`,
              path: ref.path,
              strictFailure: false,
            })
          }
          continue
        }
        throw err
      }
    }

    const { inlineContent: _, ...rest } = ref
    results.push({ ...rest, bytes })
  }

  return { results, warnings, unknownBudget }
}
