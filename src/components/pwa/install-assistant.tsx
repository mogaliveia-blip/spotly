'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const DISMISSED_AT_KEY = 'spotly.pwaInstall.dismissedAt'
const DISMISS_INTERVAL_MS = 10 * 24 * 60 * 60 * 1000
const SHOW_DELAY_MS = 5000

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type AssistantMode = 'android' | 'ios'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function isDismissedRecently(): boolean {
  const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) ?? 0)
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_INTERVAL_MS
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)

  return isIos && isSafari
}

export function PwaInstallAssistant() {
  const [mode, setMode] = useState<AssistantMode | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  const canShow = useMemo(() => mode !== null && !isStandalone(), [mode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandalone() || isDismissedRecently()) return

    let showTimer: number | undefined

    const showLater = (nextMode: AssistantMode) => {
      window.clearTimeout(showTimer)
      setMode(nextMode)
      showTimer = window.setTimeout(() => {
        if (!isStandalone() && !isDismissedRecently()) setVisible(true)
      }, SHOW_DELAY_MS)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
      showLater('android')
    }

    const handleInstalled = () => {
      window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
      setVisible(false)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    if (isIosSafari()) showLater('ios')

    return () => {
      window.clearTimeout(showTimer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
    setVisible(false)
  }

  const install = async () => {
    if (!installPrompt) return

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)

    if (choice.outcome === 'accepted') {
      window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
      setVisible(false)
    }
  }

  if (!visible || !canShow) return null
  if (mode === 'android' && !installPrompt) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:inset-x-auto sm:right-4 sm:w-[360px] sm:px-0 sm:pb-4">
      <Card className="rounded-2xl border-muted/80 bg-background/95 shadow-2xl backdrop-blur">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {mode === 'android' ? <Download className="h-5 w-5" /> : <Share className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold leading-tight">Installez Spotly</h2>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    Retrouvez plus facilement vos événements depuis votre écran d'accueil.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={dismiss}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {mode === 'ios' && (
            <div className="rounded-xl border bg-muted/20 p-3 text-sm font-semibold">
              Partager <span className="text-muted-foreground">→</span> En voir plus <span className="text-muted-foreground">→</span> Sur l'écran d'accueil
            </div>
          )}

          <div className="flex gap-2">
            {mode === 'android' && (
              <Button type="button" className="h-11 flex-1 rounded-xl font-bold" onClick={() => void install()}>
                Installer
              </Button>
            )}
            <Button type="button" variant={mode === 'android' ? 'outline' : 'default'} className="h-11 flex-1 rounded-xl font-bold" onClick={dismiss}>
              {mode === 'ios' ? "J'ai compris" : 'Plus tard'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
