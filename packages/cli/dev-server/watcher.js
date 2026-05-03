import { watch } from 'chokidar'

const BURST_MS = 300

function ignoreFn(p) {
  return (
    p.includes('/.fin14/') ||
    p.includes('\\.fin14\\') ||
    /[~]$/.test(p) ||
    /\.(tmp|temp|swp)$/.test(p) ||
    /(^|\/)\.DS_Store$/.test(p) ||
    /(^|\/)Thumbs\.db$/.test(p)
  )
}

export function createWatcher(outputDir, onBatch) {
  const watcher = watch(outputDir, {
    persistent: true,
    ignoreInitial: true,
    atomic: true,
    awaitWriteFinish: false,
    ignored: ignoreFn,
  })

  let burstBuffer = []
  let burstTimer = null

  function handleEvent(path) {
    burstBuffer.push(path)
    clearTimeout(burstTimer)
    burstTimer = setTimeout(() => {
      const paths = burstBuffer.slice()
      burstBuffer = []
      burstTimer = null
      onBatch(paths)
    }, BURST_MS)
  }

  watcher.on('add', handleEvent)
  watcher.on('change', handleEvent)
  watcher.on('unlink', handleEvent)

  return {
    close: () => watcher.close(),
  }
}
