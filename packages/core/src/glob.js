function globToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, '/')
  let re = ''
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    if (char === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 2
        } else {
          re += '.*'
          i++
        }
      } else {
        re += '[^/]*'
      }
    } else if (char === '?') {
      re += '[^/]'
    } else if ('.+^${}()|[]\\'.includes(char)) {
      re += '\\' + char
    } else {
      re += char
    }
  }
  return new RegExp('^' + re + '$')
}

export function matchGlob(path, pattern) {
  return globToRegExp(pattern).test(path.replace(/\\/g, '/'))
}

export function matchesAny(path, patterns) {
  return patterns.some(pattern => matchGlob(path, pattern))
}

export function filterPages(relPaths, config) {
  const include = config.project?.include ?? []
  const exclude = config.project?.exclude ?? []
  return relPaths.filter(path => {
    if (include.length > 0 && !matchesAny(path, include)) return false
    if (matchesAny(path, exclude)) return false
    return true
  })
}

export function resolveBudget(relFile, config) {
  const overrides = config.budget?.overrides ?? []
  const match = overrides.find(override => matchGlob(relFile, override.path))
  return match ? match.budget : config.budget.default
}
