import { BrowserRouter, Route, Routes } from "react-router-dom"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { HistoryPage } from "./pages/history"
import { HomePage } from "@/pages/home"
import { ReviewPage } from "@/pages/review"
import { SearchPage } from "./pages/search"
import { TopicPage } from "@/pages/topic"

export function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-svh flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Bỏ qua tới nội dung
        </a>
        <SiteHeader />
        <main id="main-content" className="flex-1 scroll-mt-14">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/topic/:topicId" element={<TopicPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </main>
        <SiteFooter />
      </div>
    </BrowserRouter>
  )
}

export default App
