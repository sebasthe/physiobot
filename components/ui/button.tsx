import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[min(var(--radius-lg),18px)] border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_10px_30px_rgba(240,160,75,0.24)] hover:bg-primary/92 hover:-translate-y-0.5",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border-border bg-card/80 text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.22)] hover:bg-secondary hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        ghost:
          "hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(42,157,138,0.22)] hover:bg-accent/92 hover:-translate-y-0.5",
      },
      size: {
        default: "h-11 px-5 py-2.5 has-[>svg]:px-4",
        xs: "h-7 gap-1 rounded-xl px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-[14px] px-4 has-[>svg]:px-3",
        lg: "h-12 rounded-[20px] px-6 text-base has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-7 rounded-xl [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-[14px]",
        "icon-lg": "size-12 rounded-[20px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
