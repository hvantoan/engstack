import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
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
    </ThemeProvider>
  </StrictMode>
)
