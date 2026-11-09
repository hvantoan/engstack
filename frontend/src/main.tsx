import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
// Dev-only: dynamic import giữ agentation khỏi production bundle.
const Agentation = import.meta.env.DEV
  ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
  : () => null
import { bootstrapAuth } from "@/lib/auth"
// Đăng ký hydrate/clear tiến độ trước khi bootstrap chạy (module scope, không useEffect).
import "@/lib/progress"

// Một lần ở module scope: StrictMode double-invoke trong useEffect sẽ tạo hai
// refresh token single-use → backend revoke toàn bộ session.
bootstrapAuth()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
      <Suspense>
        <Agentation />
      </Suspense>
    </ThemeProvider>
  </StrictMode>
)
