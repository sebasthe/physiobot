import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary/16 text-primary [a&]:hover:bg-primary/22",
        secondary:
          "bg-accent/14 text-accent [a&]:hover:bg-accent/20",
        destructive:
          "bg-destructive/14 text-destructive focus-visible:ring-destructive/20 [a&]:hover:bg-destructive/20",
        outline:
          "border-border bg-card/70 text-foreground [a&]:hover:bg-secondary",
        ghost: "[a&]:hover:bg-secondary [a&]:hover:text-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
