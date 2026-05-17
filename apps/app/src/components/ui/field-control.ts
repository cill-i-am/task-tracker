const fieldSurfaceClassName = "rounded-lg border border-input bg-background";

const fieldTransitionClassName =
  "transition-[color,box-shadow,background-color] outline-none";

const fieldFocusClassName =
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

const fieldInvalidClassName =
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

const fieldDisabledClassName =
  "disabled:cursor-not-allowed disabled:opacity-50";

export const fieldControlClassName = `${fieldSurfaceClassName} ${fieldTransitionClassName} ${fieldFocusClassName} ${fieldDisabledClassName} ${fieldInvalidClassName}`;

export const fieldGroupClassName = `${fieldSurfaceClassName} ${fieldTransitionClassName}`;
