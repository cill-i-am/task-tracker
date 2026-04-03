import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:py-14">
      <Card>
        <CardHeader className="gap-4">
          <Badge variant="secondary">About</Badge>
          <div className="flex flex-col gap-3">
            <CardTitle className="text-4xl sm:text-5xl">
              A small starter with room to grow.
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-8">
              TanStack Start gives you type-safe routing, server functions, and
              modern SSR defaults. Use this as a clean foundation, then layer in
              your own routes, styling, and add-ons.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Routing</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              File-based routes and type-safe links keep page navigation
              predictable as the app grows.
            </CardDescription>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Server Work</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              TanStack Start supports server functions and SSR without forcing a
              heavy initial architecture.
            </CardDescription>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>UI Foundation</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              The app now uses shadcn as its shared visual baseline, which makes
              future auth and product screens more consistent.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
