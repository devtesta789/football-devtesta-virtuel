import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";

const MAX_ATTEMPTS_BEFORE_LOCK = 5;
const LOCK_DURATION_SEC = 30;

export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lockUntil) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lockUntil]);

  const remainingLock = lockUntil && lockUntil > now ? Math.ceil((lockUntil - now) / 1000) : 0;
  const isLocked = remainingLock > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setIsLoading(true);
    setErrorMsg(null);
    const ok = await login(password);
    if (ok) {
      toast.success(t("login.accessGranted"));
      setAttempts(0);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setErrorMsg(t("login.errorMessage"));
      toast.error(t("login.accessDenied"));
      if (next >= MAX_ATTEMPTS_BEFORE_LOCK) {
        setLockUntil(Date.now() + LOCK_DURATION_SEC * 1000);
        setAttempts(0);
      }
      setPassword("");
    }
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
                className={`w-full border bg-background px-3 py-2 pr-14 font-mono text-sm text-foreground transition-colors focus:outline-none ${
                  errorMsg ? "border-danger focus:border-danger" : "border-border focus:border-cyan"
                }`}
                autoFocus
                disabled={isLoading || isLocked}
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

          {errorMsg && !isLocked && (
            <div className="border border-danger/50 bg-danger/10 px-3 py-2">
              <p className="font-mono text-[11px] text-danger">{errorMsg}</p>
              {attempts > 0 && (
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-danger/70">
                  {t("login.attempts", { count: attempts })}
                </p>
              )}
            </div>
          )}

          {isLocked && (
            <div className="border border-warn/60 bg-warn/10 px-3 py-2">
              <p className="font-mono text-[11px] text-warn">
                {t("login.locked", { seconds: remainingLock })}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password || isLocked}
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
