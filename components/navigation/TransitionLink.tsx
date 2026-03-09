'use client'

import Link from 'next/link'
import type { ComponentProps, MouseEvent } from 'react'
import { useSoftNavigation } from '@/lib/navigation'

type TransitionLinkProps = ComponentProps<typeof Link>

export default function TransitionLink({
  href,
  children,
  className,
  target,
  rel,
  scroll,
  replace,
  onClick,
  ...props
}: TransitionLinkProps) {
  const navigation = useSoftNavigation()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      target === '_blank' ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    if (typeof href !== 'string') return

    event.preventDefault()
    if (replace) {
      navigation.replace(href, { scroll })
      return
    }
    navigation.push(href, { scroll })
  }

  return (
    <Link
      href={href}
      className={className}
      target={target}
      rel={rel}
      scroll={scroll}
      replace={replace}
      onClick={handleClick}
      {...props}
    >
      {children}
    </Link>
  )
}
