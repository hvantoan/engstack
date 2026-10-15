import { Link, NavLink } from "react-router-dom"
import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { useTotalLearned } from "@/lib/progress"

export function SiteHeader() {
  const { theme, setTheme } = useTheme()
  const learned = useTotalLearned()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-heading text-base font-medium"
          aria-label="engstack — về trang chủ"
        >
          <img src="/engstack-logo.png" alt="" className="size-7" />
          engstack
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                isActive ? "font-medium text-foreground" : "text-muted-foreground"
              }`
            }
          >
            Chủ đề
          </NavLink>
          <span className="hidden text-xs text-muted-foreground sm:block">
            Đã thuộc:{" "}
            <span className="font-medium text-success">{learned}</span> từ
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Đổi giao diện sáng/tối"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </nav>
      </div>
    </header>
  )
}
