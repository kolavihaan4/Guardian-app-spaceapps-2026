// Starts the Python service that runs the ultrasound models (ai/ultrasound_service/server.py).
// Used by `npm run dev`. If Python or its packages are missing, the rest of the app still runs and
// the ultrasound cards say the analysis service is not running.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const script = resolve(root, 'ai/ultrasound_service/server.py')
const candidates = [process.env.ULTRASOUND_PYTHON, resolve(root, '.venv/Scripts/python.exe'), resolve(root, '.venv/bin/python'), 'python3', 'python'].filter(Boolean)
const works = (cmd) => (/[\\/]/.test(cmd) ? existsSync(cmd) : true) && spawnSync(cmd, ['-c', 'import torch, numpy, scipy, PIL'], { stdio: 'ignore' }).status === 0
const python = candidates.find(works)

const idle = (why) => {
  console.log(`Ultrasound analysis is off: ${why}`)
  console.log('To turn it on, see ai/ultrasound_service/README.md. The rest of the app works without it.')
  setInterval(() => {}, 1 << 30) // stay alive so the other dev processes keep running
}

if (!python) {
  idle('no Python with torch, numpy, scipy and Pillow was found (set ULTRASOUND_PYTHON in .env).')
} else {
  const child = spawn(python, ['-W', 'ignore', script], { stdio: 'inherit', cwd: resolve(root, 'ai/ultrasound_service') })
  child.on('error', (e) => idle(`could not start Python (${e.message}).`))
  child.on('exit', (code) => (code ? idle(`the service stopped (exit code ${code}).`) : process.exit(0)))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill())
}
