import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";

export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const ok = await login(password);
    if (ok) toast.success(t("login.accessGranted"));
    else toast.error(t("login.accessDenied"));
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm border border-border bg-panel p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 border border-cyan px-2 py-1">
            <span className="size-1.5 animate-pulse bg-cyan" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
              {t("login.secureEntry")}
            </span>
          </div>
          <h1 className="font-mono text-lg font-bold tracking-wider text-foreground">
            {t("app.title")}
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("login.masterPassword")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.enterKey")}
                className="w-full border border-border bg-background px-3 py-2 pr-14 font-mono text-sm text-foreground transition-colors focus:border-cyan focus:outline-none"
                autoFocus
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? t("login.hide") : t("login.show")}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full border border-cyan bg-cyan/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-40"
          >
            {isLoading ? t("login.authenticating") : t("login.unlock")}
          </button>

          <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("login.footer")}
          </p>
        </form>
      </div>
    </div>
  );
}
