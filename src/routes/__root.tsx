import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LoginScreen } from "@/components/LoginScreen";
import { ThemeToggle } from "@/components/ThemeToggle";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-7xl font-bold text-cyan">404</h1>
        <h2 className="mt-4 font-mono text-sm uppercase tracking-widest text-foreground">
          Page not found
        </h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center border border-cyan bg-cyan/10 px-4 py-2 font-mono text-xs uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-1.5 animate-pulse bg-lime" />
            <span className="font-mono text-xs font-bold tracking-widest text-foreground">
              ENGLISH PREDICT PRO
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="border border-border bg-panel px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-panel-hover hover:text-foreground"
              title="Lock terminal"
            >
              ⏏ Lock
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--panel)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              borderRadius: 0,
            },
          }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "English Predict Pro — AI Football Predictions" },
      {
        name: "description",
        content:
          "Neural prediction engine for Premier League. Hybrid Poisson model with self-learning AI, value bets, and live round sync.",
      },
      { name: "theme-color", content: "#1a1a24" },
      { property: "og:title", content: "English Predict Pro" },
      {
        property: "og:description",
        content: "AI-powered football prediction terminal.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});
