import { Link, NavLink } from "react-router-dom"
import {
  AlertTriangleIcon,
  Clock3Icon,
  LogOutIcon,
  MoonIcon,
  RefreshCwIcon,
  SunIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { GoogleLoginButton } from "@/components/google-login-button"
import { useTheme } from "@/components/theme-provider"
import { logout, useAuth } from "@/lib/auth"
import {
  retryProgressSync,
  useProgressReady,
  useProgressSyncIssues,
  useProgressSyncing,
  useTotalLearned,
} from "@/lib/progress"
import { useReviewSummary } from "@/lib/review"

function UserBadge({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-7 overflow-hidden rounded-full border border-border bg-muted">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-xs font-medium text-foreground">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="hidden max-w-32 truncate text-xs text-muted-foreground sm:block">
        {name}
      </span>
    </span>
  )
}

export function SiteHeader() {
  const { theme, setTheme } = useTheme()
  const { status, user } = useAuth()
  const learned = useTotalLearned()
  const ready = useProgressReady()
  const syncIssues = useProgressSyncIssues()
  const syncing = useProgressSyncing()
  const reviewSummary = useReviewSummary()

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
          <NavLink
            to="/review"
            className={({ isActive }) =>
              `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                isActive ? "font-medium text-foreground" : "text-muted-foreground"
              }`
            }
          >
            <Clock3Icon className="size-3.5" aria-hidden />
            Ôn hôm nay
            {status === "authenticated" && reviewSummary && reviewSummary.dueCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {reviewSummary.dueCount}
              </span>
            )}
          </NavLink>
          <span className="hidden text-xs text-muted-foreground sm:block">
            Đã thuộc:{" "}
            <span className="font-medium text-success">
              {ready ? learned : "—"}
            </span>{" "}
            từ
          </span>

          {status === "loading" && (
            <span className="h-7 w-24 animate-pulse rounded-md bg-muted" aria-hidden />
          )}

          {status === "guest" && <GoogleLoginButton />}

          {status === "authenticated" && (
            <>
              <UserBadge
                name={user?.name || user?.email || "Tài khoản"}
                avatarUrl={user?.avatarUrl}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Đăng xuất"
                title="Đăng xuất"
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => void logout()}
              >
                <LogOutIcon />
              </Button>
            </>
          )}

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
      {syncIssues.length > 0 && (
        <div className="border-t border-destructive/30 bg-destructive/10">
          <div
            role="alert"
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-xs text-foreground"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangleIcon className="size-3.5 text-destructive" aria-hidden />
              Không lưu được {syncIssues.length} thay đổi tiến độ.
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={() => void retryProgressSync()}
              className="h-7 cursor-pointer bg-background text-xs"
            >
              <RefreshCwIcon
                className={syncing ? "size-3.5 animate-spin" : "size-3.5"}
                aria-hidden
              />
              Thử lại
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
