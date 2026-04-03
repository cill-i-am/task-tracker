import { Link, createFileRoute } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/")({ component: App });

const features = [
  {
    title: "Type-Safe Routing",
    description: "Routes and links stay in sync across every page.",
  },
  {
    title: "Server Functions",
    description:
      "Call server code from your UI without creating API boilerplate.",
  },
  {
    title: "Streaming by Default",
    description:
      "Ship progressively rendered responses for faster experiences.",
  },
  {
    title: "Tailwind Native",
    description:
      "Design quickly with utility-first styling and reusable tokens.",
  },
];

function App() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:py-14">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <Card className="relative overflow-hidden">
          <CardHeader className="gap-4">
            <Badge variant="secondary">TanStack Start Base Template</Badge>
            <div className="flex flex-col gap-3">
              <CardTitle className="max-w-3xl text-4xl sm:text-6xl">
                Start simple, ship quickly.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base sm:text-lg">
                This base starter intentionally keeps things light: two routes,
                clean structure, and the essentials you need to build from
                scratch.
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-3">
            <Link
              to="/about"
              className={buttonVariants({ variant: "default", size: "lg" })}
            >
              About This Starter
            </Link>
            <a
              href="https://tanstack.com/router"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Router Guide
            </a>
          </CardFooter>
        </Card>

        <Card size="sm">
          <CardHeader>
            <Badge variant="outline">Quick Start</Badge>
            <CardTitle>What to change first</CardTitle>
            <CardDescription>
              The scaffold is now aligned with shadcn, so the next steps can
              stay inside the same component system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="m-0 flex list-disc flex-col gap-3 pl-5 text-sm text-muted-foreground">
              <li>
                Edit <code>src/routes/index.tsx</code> to customize the home
                page.
              </li>
              <li>
                Update <code>src/components/site-header.tsx</code> and{" "}
                <code>src/components/app-sidebar.tsx</code> for app chrome.
              </li>
              <li>
                Build auth screens with <code>Card</code>, <code>Field</code>,{" "}
                <code>Input</code>, and <code>Button</code>.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => (
          <Card key={feature.title} size="sm" className="h-full">
            <CardHeader>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{feature.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <Badge variant="outline">Next Up</Badge>
            <CardTitle>Auth-ready primitives are installed</CardTitle>
            <CardDescription>
              The app now has the button, input, card, field, and badge
              components in place for login and signup work.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-sm text-muted-foreground">
              TanStack Form pairs nicely with the generated{" "}
              <code>FieldGroup</code>, <code>FieldLabel</code>, and{" "}
              <code>FieldError</code> components, so the forms can follow the
              current shadcn guidance instead of a custom input stack.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <Badge variant="outline">Design System</Badge>
            <CardTitle>One visual language</CardTitle>
            <CardDescription>
              The old glassmorphism starter styles are gone. Pages now build on
              the shadcn token set, typography, spacing, and primitives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {["Card", "Button", "Badge", "Field", "Input"].map((item) => (
                <span
                  key={item}
                  className={cn(
                    "inline-flex items-center rounded-3xl bg-muted px-3 py-1 text-sm text-muted-foreground"
                  )}
                >
                  {item}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
