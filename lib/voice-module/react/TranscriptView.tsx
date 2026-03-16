'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { TranscriptMessage } from '../core/types'

interface TranscriptViewProps {
  messages: TranscriptMessage[]
  className?: string
  userLabel?: string
  assistantLabel?: string
}

export function TranscriptView({
  messages,
  className,
  userLabel = 'Du',
  assistantLabel = 'Coach',
}: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages.length])

  if (messages.length === 0) {
    return null
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex max-h-80 flex-col gap-3 overflow-y-auto rounded-[22px] border border-white/10 bg-black/10 p-4',
        className,
      )}
    >
      {messages.map((message, index) => {
        const isUser = message.role === 'user'
        return (
          <div
            key={`${message.timestamp}-${index}`}
            className={cn('flex flex-col gap-1', isUser ? 'items-end text-right' : 'items-start text-left')}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {isUser ? userLabel : assistantLabel}
            </span>
            <div
              className={cn(
                'max-w-[90%] rounded-[18px] px-3 py-2 text-sm shadow-[var(--shadow-sm)]',
                isUser ? 'bg-primary/15 text-foreground' : 'bg-card/80 text-foreground',
              )}
            >
              {message.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}
