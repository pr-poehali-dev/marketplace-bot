import { useState } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  onLogin: (email: string, password: string) => Promise<string | null>;
  onRegister: (email: string, password: string, name: string) => Promise<string | null>;
}

export default function AuthPage({ onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const err = mode === "login"
      ? await onLogin(email, password)
      : await onRegister(email, password, name);
    if (err) setError(err);
    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "hsl(220,16%,5%)", fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#005BFF" }}>
            <Icon name="BarChart3" size={16} className="text-white" />
          </div>
          <span className="text-lg font-semibold text-foreground">MarketDash</span>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border p-8" style={{ background: "hsl(220,14%,9%)" }}>
          <h1 className="text-xl font-semibold text-foreground mb-1">
            {mode === "login" ? "Добро пожаловать" : "Создать аккаунт"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "login" ? "Войдите в свой аккаунт" : "Зарегистрируйтесь чтобы начать"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Имя</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                  required
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-blue-500/60 transition-colors"
                  style={{ background: "hsl(220,16%,6%)" }}
                />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-blue-500/60 transition-colors"
                style={{ background: "hsl(220,16%,6%)" }}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "Минимум 6 символов" : "••••••••"}
                  required
                  className="w-full rounded-lg border border-border px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-blue-500/60 transition-colors"
                  style={{ background: "hsl(220,16%,6%)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Icon name={showPassword ? "EyeOff" : "Eye"} size={15} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2.5">
                <Icon name="AlertCircle" size={14} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: "#005BFF" }}
            >
              {loading && <Icon name="Loader2" size={15} className="animate-spin" />}
              {mode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>
          </form>
        </div>

        {/* Switch */}
        <p className="text-center text-sm text-muted-foreground mt-4">
          {mode === "login" ? "Нет аккаунта?" : "Уже есть аккаунт?"}{" "}
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            {mode === "login" ? "Зарегистрироваться" : "Войти"}
          </button>
        </p>
      </div>
    </div>
  );
}
