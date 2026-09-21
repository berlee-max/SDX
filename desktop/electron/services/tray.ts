import { existsSync } from 'node:fs'
import path from 'node:path'
import type { App, Tray } from 'electron'

type ElectronTrayRuntime = Pick<typeof import('electron'), 'Menu' | 'Tray' | 'nativeImage'>

export type TrayController = {
  tray: Tray
  dispose(): void
}

export function resolveTrayIconPath(desktopRoot: string): string {
  const candidates = [
    path.join(desktopRoot, 'src-tauri', 'icons', 'icon.png'),
    path.join(desktopRoot, 'public', 'app-icon.png'),
    path.join(desktopRoot, 'dist', 'app-icon.png'),
  ]
  const resolved = candidates.find(candidate => existsSync(candidate))
  if (!resolved) {
    throw new Error(`Electron tray icon not found under ${desktopRoot}`)
  }
  return resolved
}

export function shouldInstallTray(platform = process.platform): boolean {
  return platform !== 'darwin'
}

export async function installTray({
  app,
  desktopRoot,
  show,
  quit,
  electronRuntime,
}: {
  app: App
  desktopRoot: string
  show: () => void
  quit: () => void
  electronRuntime?: ElectronTrayRuntime
}): Promise<TrayController> {
  const { Menu, Tray, nativeImage } = electronRuntime ?? await import('electron')
  const icon = nativeImage.createFromPath(resolveTrayIconPath(desktopRoot))
  const tray = new Tray(icon)
  // One name for all three. `app.name` is electron-builder's productName, so
  // the menu tracks whatever the app was packaged as; the labels used to be
  // hardcoded beside a tooltip that read app.name, which is how a rename leaves
  // a tray saying one thing and a Dock saying another.
  const productName = app.name || 'AI Agent SDX'
  tray.setToolTip(productName)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show ${productName}`, click: show },
    { type: 'separator' },
    { label: `Quit ${productName}`, click: quit },
  ]))
  tray.on('click', show)

  return {
    tray,
    dispose() {
      tray.destroy()
    },
  }
}
