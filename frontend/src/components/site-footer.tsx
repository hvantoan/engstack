export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <img src="/engstack-logo.png" alt="" className="size-6" />
          <span className="font-heading text-foreground">engstack</span>
          <span>— IELTS Vocabulary</span>
        </div>
        <p>20 chủ đề · 4.000 mục từ · B2–C1</p>
      </div>
    </footer>
  )
}
