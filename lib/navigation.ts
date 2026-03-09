'use client'

import { useRouter } from 'next/navigation'

type NavigateOptions = {
  replace?: boolean
  scroll?: boolean
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => unknown
}

function runWithViewTransition(update: () => void) {
  const transitionDocument = typeof document === 'undefined' ? null : (document as ViewTransitionDocument)

  if (!transitionDocument || typeof transitionDocument.startViewTransition !== 'function') {
    update()
    return
  }

  transitionDocument.startViewTransition(() => {
    update()
  })
}

export function useSoftNavigation() {
  const router = useRouter()

  const navigate = (href: string, options?: NavigateOptions) => {
    runWithViewTransition(() => {
      if (options?.replace) {
        router.replace(href, { scroll: options.scroll })
        return
      }

      router.push(href, { scroll: options?.scroll })
    })
  }

  return {
    push: (href: string, options?: Omit<NavigateOptions, 'replace'>) => navigate(href, options),
    replace: (href: string, options?: Omit<NavigateOptions, 'replace'>) => navigate(href, { ...options, replace: true }),
    prefetch: (href: string) => router.prefetch(href),
    refresh: () => router.refresh(),
  }
}
