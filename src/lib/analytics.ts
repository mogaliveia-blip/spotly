'use client'

import { initializeApp } from "firebase/app"
import { getAnalytics } from "firebase/analytics"

let analytics: any = null

if (typeof window !== "undefined") {
  analytics = getAnalytics()
}

export { analytics }