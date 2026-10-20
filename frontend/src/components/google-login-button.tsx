import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { loginWithGoogle } from "@/lib/auth"

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

type GisCredentialResponse = { credential: string }

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (response: GisCredentialResponse) => void
      }) => void
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
    }
  }
}

function gis(): GoogleIdentity | undefined {
  return (window as Window & { google?: GoogleIdentity }).google
}

function signIn(idToken: string) {
  void loginWithGoogle(idToken).catch((error: unknown) => {
    console.error("[auth] Đăng nhập thất bại:", error)
  })
}

export function GoogleLoginButton() {
  const slot = useRef<HTMLDivElement>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false
    let timer = 0
    let tries = 0

    const mount = () => {
      if (cancelled) return
      const identity = gis()
      if (!identity) {
        // Script GIS tải bất đồng bộ — chờ tối đa ~2s rồi bỏ (nút ẩn, không vỡ header).
        if (++tries > 5) {
          setUnavailable(true)
          return
        }
        timer = window.setTimeout(mount, 400)
        return
      }
      identity.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => signIn(response.credential),
      })
      if (slot.current) {
        identity.accounts.id.renderButton(slot.current, {
          theme: "outline",
          size: "medium",
          text: "signin_with",
          locale: "vi",
        })
      }
    }

    mount()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  if (!CLIENT_ID) {
    // Không có client ID: chỉ dev mới có đường đăng nhập (backend AUTH_DEV_MODE).
    if (!import.meta.env.DEV) return null
    return (
      <Button
        variant="outline"
        size="sm"
        className="cursor-pointer"
        onClick={() => signIn("dev:dev@example.com")}
      >
        Đăng nhập (dev)
      </Button>
    )
  }

  if (unavailable) return null
  return <div ref={slot} className="min-h-8" />
}
