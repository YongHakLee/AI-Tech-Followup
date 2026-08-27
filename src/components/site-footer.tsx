export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-8 text-xs leading-relaxed text-muted-foreground">
        <p>
          이 사이트는 각 저자가 공개한 피드에서 제목과 발췌만 수집해 한국어 요약과 원문 링크를
          제공합니다. 원문 본문을 보관하지 않으며, 모든 저작권은 원저자에게 있습니다.
        </p>
        <p className="mt-2">
          <a href="/feed.xml" className="hover:text-foreground">
            RSS
          </a>
        </p>
      </div>
    </footer>
  )
}
