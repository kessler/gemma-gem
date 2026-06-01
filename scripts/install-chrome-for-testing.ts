import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const INSTALL_ROOT = resolve(REPO_ROOT, '.browsers', 'chrome-for-testing')
const MANIFEST_URL = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'

type Download = {
  platform: string
  url: string
}

type Manifest = {
  channels: {
    Stable: {
      version: string
      downloads: {
        chrome: Download[]
      }
    }
  }
}

function platformName(): string {
  if (process.platform === 'win32') return 'win64'
  if (process.platform === 'linux') return 'linux64'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'
  throw new Error(`Unsupported platform for Chrome for Testing: ${process.platform} ${process.arch}`)
}

function executablePath(version: string): string {
  const platform = platformName()
  if (platform === 'win64') return resolve(INSTALL_ROOT, version, 'chrome-win64', 'chrome.exe')
  if (platform === 'linux64') return resolve(INSTALL_ROOT, version, 'chrome-linux64', 'chrome')
  return resolve(INSTALL_ROOT, version, platform === 'mac-arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true })
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  const file = createWriteStream(outputPath)
  await new Promise<void>((resolveDownload, reject) => {
    response.body!.pipeTo(new WritableStream({
      write(chunk) {
        file.write(Buffer.from(chunk))
      },
      close() {
        file.end(resolveDownload)
      },
      abort(reason) {
        file.destroy()
        reject(reason)
      },
    })).catch(reject)
  })
}

async function run(command: string, args: string[]): Promise<void> {
  const child = spawn(command, args, { stdio: 'inherit' })
  const [code] = await once(child, 'exit') as [number | null]
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${code}`)
  }
}

async function extract(zipPath: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true })
  if (process.platform === 'win32') {
    await run('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destination)} -Force`,
    ])
    return
  }
  await run('unzip', ['-q', '-o', zipPath, '-d', destination])
}

async function main(): Promise<void> {
  const manifest = await fetch(MANIFEST_URL).then(response => {
    if (!response.ok) throw new Error(`Failed to fetch Chrome for Testing manifest: ${response.status}`)
    return response.json() as Promise<Manifest>
  })
  const stable = manifest.channels.Stable
  const platform = platformName()
  const download = stable.downloads.chrome.find(item => item.platform === platform)
  if (!download) {
    throw new Error(`No Chrome for Testing download for platform ${platform}`)
  }

  const exePath = executablePath(stable.version)
  if (existsSync(exePath)) {
    console.log(`Chrome for Testing already installed: ${exePath}`)
    await writeFile(resolve(INSTALL_ROOT, 'chrome-path.txt'), exePath)
    return
  }

  const versionDir = resolve(INSTALL_ROOT, stable.version)
  const zipPath = resolve(INSTALL_ROOT, basename(download.url))
  await rm(versionDir, { recursive: true, force: true })
  console.log(`Downloading Chrome for Testing ${stable.version} (${platform})...`)
  await downloadFile(download.url, zipPath)
  console.log(`Extracting ${zipPath}...`)
  await extract(zipPath, versionDir)
  await rm(zipPath, { force: true })

  if (!existsSync(exePath)) {
    const aboutDir = platform === 'win64' ? 'chrome-win64' : platform === 'linux64' ? 'chrome-linux64' : platform
    const listing = await readFile(resolve(versionDir, aboutDir, 'ABOUT'), 'utf8').catch(() => '')
    throw new Error(`Chrome executable was not found after extraction: ${exePath}\n${listing}`)
  }

  await writeFile(resolve(INSTALL_ROOT, 'chrome-path.txt'), exePath)
  console.log(`Chrome for Testing installed: ${exePath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
