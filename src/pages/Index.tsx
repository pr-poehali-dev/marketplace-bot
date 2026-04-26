import { useState } from "react";
import Icon from "@/components/ui/icon";

type Section =
  | "sync"
  | "analytics"
  | "finance"
  | "pricing"
  | "products"
  | "orders"
  | "settings";

const NAV_ITEMS: { id: Section; label: string; icon: string; badge?: number }[] =
  [
    { id: "sync", label: "Синхронизация", icon: "RefreshCw", badge: 2 },
    { id: "analytics", label: "Аналитика", icon: "BarChart3" },
    { id: "finance", label: "Финансы", icon: "Wallet" },
    { id: "pricing", label: "Ценовая", icon: "Tag" },
    { id: "products", label: "Товары", icon: "Package" },
    { id: "orders", label: "Заказы", icon: "ShoppingCart", badge: 14 },
    { id: "settings", label: "Настройки", icon: "Settings" },
  ];

const NOTIFICATIONS = [
  { id: 1, type: "warn", text: "Ozon: комиссия на категорию «Электроника» выросла на 2%", time: "5 мин" },
  { id: 2, type: "info", text: "WB: новые требования к маркировке товаров с 1 мая", time: "2 ч" },
  { id: 3, type: "success", text: "Прогноз спроса обновлён — 47 SKU требуют дозаказа", time: "4 ч" },
  { id: 4, type: "danger", text: "3 товара вышли из топ-100 по ключевым запросам", time: "6 ч" },
];

const STATS = [
  { label: "Выручка за месяц", value: "4 821 300 ₽", delta: "+12.4%", up: true },
  { label: "Заказов сегодня", value: "347", delta: "+8.1%", up: true },
  { label: "Средний чек", value: "13 894 ₽", delta: "-2.3%", up: false },
  { label: "Маржа", value: "22.7%", delta: "+1.1%", up: true },
];

const PLATFORMS = [
  { name: "Ozon", status: "online", orders: 198, revenue: "2 641 000 ₽", color: "#005BFF" },
  { name: "Wildberries", status: "online", orders: 149, revenue: "2 180 300 ₽", color: "#CB11AB" },
];

const CHART_DATA = [42, 65, 53, 78, 91, 85, 102, 97, 118, 124, 109, 138];
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const TOP_PRODUCTS = [
  { name: "Наушники TWS Pro X12", sku: "OZ-44821", sales: 312, revenue: "1 248 000 ₽", stock: 84 },
  { name: "Умная колонка Hori M2", sku: "WB-29103", sales: 198, revenue: "891 000 ₽", stock: 12 },
  { name: "Фитнес-браслет ActFit 5", sku: "OZ-77234", sales: 176, revenue: "704 000 ₽", stock: 203 },
  { name: "Портативный аккумулятор 20K", sku: "WB-51029", sales: 145, revenue: "362 500 ₽", stock: 0 },
  { name: "Беспроводная зарядка X3", sku: "OZ-38821", sales: 134, revenue: "268 000 ₽", stock: 67 },
];

const ORDERS = [
  { id: "#OZ-48291", platform: "Ozon", product: "Наушники TWS Pro X12", date: "26 апр, 14:32", amount: "3 990 ₽", status: "new" },
  { id: "#WB-93021", platform: "WB", product: "Умная колонка Hori M2", date: "26 апр, 13:15", amount: "4 500 ₽", status: "shipping" },
  { id: "#OZ-48180", platform: "Ozon", product: "Фитнес-браслет ActFit 5", date: "26 апр, 11:48", amount: "3 999 ₽", status: "done" },
  { id: "#WB-93014", platform: "WB", product: "Портативный аккумулятор 20K", date: "26 апр, 10:20", amount: "2 500 ₽", status: "done" },
  { id: "#OZ-48099", platform: "Ozon", product: "Беспроводная зарядка X3", date: "25 апр, 22:05", amount: "1 999 ₽", status: "cancelled" },
];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  new: { label: "Новый", color: "text-blue-400" },
  shipping: { label: "Доставка", color: "text-yellow-400" },
  done: { label: "Выполнен", color: "text-green-400" },
  cancelled: { label: "Отменён", color: "text-red-400" },
};

const PRICE_RECS = [
  { name: "Наушники TWS Pro X12", current: "3 990 ₽", rec: "4 290 ₽", reason: "Конкуренты подняли цену, запас маржи 18%", action: "повысить" },
  { name: "Умная колонка Hori M2", current: "4 500 ₽", rec: "4 199 ₽", reason: "Падение в выдаче, цена выше рынка на 7%", action: "снизить" },
  { name: "Портативный аккумулятор 20K", current: "2 500 ₽", rec: "2 500 ₽", reason: "Оптимальная цена, удерживать позицию", action: "держать" },
];

const FORECAST = [
  { name: "Наушники TWS Pro X12", nextMonth: "+34%", stock: 84, needOrder: false },
  { name: "Умная колонка Hori M2", nextMonth: "+61%", stock: 12, needOrder: true },
  { name: "Фитнес-браслет ActFit 5", nextMonth: "+18%", stock: 203, needOrder: false },
  { name: "Портативный аккумулятор 20K", nextMonth: "+29%", stock: 0, needOrder: true },
];

export default function Index() {
  const [activeSection, setActiveSection] = useState<Section>("analytics");
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const maxChart = Math.max(...CHART_DATA);

  return (
    <div className="flex h-screen bg-background overflow-hidden font-['IBM_Plex_Sans',sans-serif]">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border transition-all duration-300 ${
          sidebarOpen ? "w-56" : "w-14"
        } shrink-0`}
        style={{ background: "hsl(220,16%,7%)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border h-14">
          <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ background: "hsl(210,100%,56%)" }}>
            <span className="text-xs font-bold text-white">SH</span>
          </div>
          {sidebarOpen && (
            <span className="text-sm font-semibold text-foreground tracking-tight truncate">
              SellerHub
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 relative group ${
                activeSection === item.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {activeSection === item.id && (
                <span
                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
                  style={{ background: "hsl(210,100%,56%)" }}
                />
              )}
              <span className={activeSection === item.id ? "text-primary" : ""}>
                <Icon name={item.icon} fallback="Circle" size={16} />
              </span>
              {sidebarOpen && (
                <span className="truncate font-medium">{item.label}</span>
              )}
              {sidebarOpen && item.badge && (
                <span
                  className="ml-auto text-xs font-mono-num px-1.5 py-0.5 rounded text-white"
                  style={{ background: "hsl(210,100%,56%)", minWidth: 20, textAlign: "center" }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Collapse */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center py-3 border-t border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name={sidebarOpen ? "ChevronsLeft" : "ChevronsRight"} size={16} />
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-5 shrink-0" style={{ background: "hsl(220,16%,7%)" }}>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
            </h1>
            <p className="text-xs text-muted-foreground">26 апреля 2026</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-secondary transition-colors relative text-muted-foreground hover:text-foreground"
              >
                <Icon name="Bell" size={16} />
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full animate-pulse-dot" style={{ background: "hsl(38,92%,50%)" }} />
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 rounded-lg border border-border shadow-2xl animate-fade-in z-50 overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Уведомления</span>
                    <span className="text-xs text-muted-foreground">{NOTIFICATIONS.length} новых</span>
                  </div>
                  {NOTIFICATIONS.map((n) => (
                    <div key={n.id} className="flex gap-3 px-4 py-3 hover:bg-secondary transition-colors border-b border-border last:border-0 cursor-pointer">
                      <span className={`mt-0.5 shrink-0 ${n.type === "warn" ? "text-yellow-400" : n.type === "success" ? "text-green-400" : n.type === "danger" ? "text-red-400" : "text-blue-400"}`}>
                        <Icon name={n.type === "warn" ? "AlertTriangle" : n.type === "success" ? "TrendingUp" : n.type === "danger" ? "AlertCircle" : "Info"} size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">{n.text}</p>
                        <p className="text-xs text-muted-foreground mt-1">{n.time} назад</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "hsl(210,100%,56%)" }}>
              ИП
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-5 animate-fade-in" key={activeSection}>

          {/* ── ANALYTICS ── */}
          {activeSection === "analytics" && (
            <div className="space-y-5">
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {STATS.map((s) => (
                  <div key={s.label} className="rounded-lg border border-border p-4" style={{ background: "hsl(220,14%,9%)" }}>
                    <p className="text-xs text-muted-foreground mb-2">{s.label}</p>
                    <p className="text-xl font-semibold font-mono-num text-foreground">{s.value}</p>
                    <p className={`text-xs font-mono-num mt-1 ${s.up ? "text-green-400" : "text-red-400"}`}>
                      {s.delta} к прошлому месяцу
                    </p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Выручка по месяцам</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">2025–2026 · все площадки</p>
                  </div>
                  <span className="text-xs font-mono-num text-green-400 border border-green-400/20 bg-green-400/5 px-2 py-1 rounded">▲ +31.4% г/г</span>
                </div>
                <div className="flex items-end gap-1.5 h-32">
                  {CHART_DATA.map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-sm chart-bar"
                        style={{
                          height: `${(val / maxChart) * 100}%`,
                          background: i === CHART_DATA.length - 1 ? "hsl(210,100%,56%)" : "hsl(210,100%,56%,0.3)",
                          minHeight: 4,
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">{MONTHS[i]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Forecast */}
              <div className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon name="TrendingUp" size={15} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Прогноз спроса на следующий месяц</h2>
                </div>
                <div className="space-y-2">
                  {FORECAST.map((f) => (
                    <div key={f.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm text-foreground">{f.name}</p>
                        <p className="text-xs text-muted-foreground">Остаток: {f.stock} шт.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono-num text-green-400">{f.nextMonth}</span>
                        {f.needOrder && (
                          <span className="text-xs px-2 py-0.5 rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
                            Дозаказ
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SYNC ── */}
          {activeSection === "sync" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PLATFORMS.map((p) => (
                  <div key={p.name} className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: p.color }}>
                          {p.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{p.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot" />
                            <span className="text-xs text-green-400">Подключено</span>
                          </div>
                        </div>
                      </div>
                      <button className="text-xs text-muted-foreground hover:text-foreground border border-border px-2.5 py-1.5 rounded transition-colors">
                        Настроить
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded p-3" style={{ background: "hsl(220,16%,6%)" }}>
                        <p className="text-xs text-muted-foreground">Заказов сегодня</p>
                        <p className="text-lg font-semibold font-mono-num text-foreground mt-1">{p.orders}</p>
                      </div>
                      <div className="rounded p-3" style={{ background: "hsl(220,16%,6%)" }}>
                        <p className="text-xs text-muted-foreground">Выручка</p>
                        <p className="text-lg font-semibold font-mono-num text-foreground mt-1">{p.revenue}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Последняя синхронизация: 2 мин назад</span>
                      <button className="flex items-center gap-1 hover:text-foreground transition-colors">
                        <Icon name="RefreshCw" size={12} />
                        Обновить
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                <h2 className="text-sm font-semibold text-foreground mb-4">Подключить новую площадку</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {["Яндекс Маркет", "СберМегаМаркет", "Авито", "Lamoda"].map((m) => (
                    <button key={m} className="flex flex-col items-center gap-2 p-4 rounded border border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all text-xs">
                      <Icon name="Plus" size={18} />
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FINANCE ── */}
          {activeSection === "finance" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: "Доходы (апрель)", value: "4 821 300 ₽", icon: "ArrowUpCircle", color: "text-green-400" },
                  { label: "Расходы (апрель)", value: "3 724 800 ₽", icon: "ArrowDownCircle", color: "text-red-400" },
                  { label: "Чистая прибыль", value: "1 096 500 ₽", icon: "Landmark", color: "text-blue-400" },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={c.color}><Icon name={c.icon} fallback="Circle" size={16} /></span>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                    </div>
                    <p className="text-2xl font-semibold font-mono-num text-foreground">{c.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                <h2 className="text-sm font-semibold text-foreground mb-4">Структура расходов</h2>
                <div className="space-y-3">
                  {[
                    { name: "Комиссии площадок", amount: "1 446 000 ₽", pct: 38 },
                    { name: "Логистика и фулфилмент", amount: "1 114 000 ₽", pct: 30 },
                    { name: "Реклама и продвижение", amount: "744 000 ₽", pct: 20 },
                    { name: "Хранение на складе", amount: "298 000 ₽", pct: 8 },
                    { name: "Прочие расходы", amount: "122 800 ₽", pct: 4 },
                  ].map((e) => (
                    <div key={e.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground">{e.name}</span>
                        <span className="font-mono-num text-muted-foreground">{e.amount} · {e.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: "hsl(220,12%,16%)" }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${e.pct}%`, background: "hsl(210,100%,56%)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 flex items-center justify-between" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="Download" size={15} />
                  Экспорт финансового отчёта за апрель
                </div>
                <div className="flex gap-2">
                  {["Excel", "PDF", "CSV"].map((f) => (
                    <button key={f} className="text-xs px-3 py-1.5 rounded border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors">
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PRICING ── */}
          {activeSection === "pricing" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4 flex items-start gap-3" style={{ background: "hsl(220,14%,9%)", borderColor: "hsl(210,100%,56%,0.25)" }}>
                <span className="text-blue-400 mt-0.5 shrink-0"><Icon name="Sparkles" size={16} /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Рекомендации ИИ по ценообразованию</p>
                  <p className="text-xs text-muted-foreground mt-1">Анализ конкурентов обновлён 26 апр, 12:00 · На основе данных 847 конкурентов</p>
                </div>
              </div>
              <div className="space-y-3">
                {PRICE_RECS.map((r) => (
                  <div key={r.name} className="rounded-lg border border-border p-4" style={{ background: "hsl(220,14%,9%)" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Текущая</p>
                          <p className="text-sm font-mono-num text-foreground">{r.current}</p>
                        </div>
                        <Icon name="ArrowRight" size={14} className="text-muted-foreground" />
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Рекомендуемая</p>
                          <p className={`text-sm font-mono-num ${r.action === "повысить" ? "text-green-400" : r.action === "снизить" ? "text-red-400" : "text-muted-foreground"}`}>{r.rec}</p>
                        </div>
                        {r.action !== "держать" && (
                          <button className="text-xs px-3 py-1.5 rounded text-white transition-all hover:opacity-80" style={{ background: "hsl(210,100%,56%)" }}>
                            Применить
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PRODUCTS ── */}
          {activeSection === "products" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 border border-border rounded px-3 py-2 w-64" style={{ background: "hsl(220,14%,9%)" }}>
                  <Icon name="Search" size={14} className="text-muted-foreground" />
                  <input className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" placeholder="Поиск по каталогу..." />
                </div>
                <button className="flex items-center gap-2 text-sm px-4 py-2 rounded text-white" style={{ background: "hsl(210,100%,56%)" }}>
                  <Icon name="Plus" size={14} />
                  Добавить товар
                </button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Товар</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">SKU</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Продажи</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Выручка</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Остаток</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOP_PRODUCTS.map((p, i) => (
                      <tr key={p.sku} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer">
                        <td className="px-4 py-3 text-foreground">{p.name}</td>
                        <td className="px-4 py-3 font-mono-num text-xs text-muted-foreground">{p.sku}</td>
                        <td className="px-4 py-3 font-mono-num text-right text-foreground">{p.sales}</td>
                        <td className="px-4 py-3 font-mono-num text-right text-foreground">{p.revenue}</td>
                        <td className="px-4 py-3 font-mono-num text-right">
                          <span className={p.stock === 0 ? "text-red-400" : p.stock < 20 ? "text-yellow-400" : "text-green-400"}>
                            {p.stock === 0 ? "Нет" : p.stock}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ORDERS ── */}
          {activeSection === "orders" && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Новые", value: 14, color: "text-blue-400" },
                  { label: "Доставка", value: 89, color: "text-yellow-400" },
                  { label: "Выполнены", value: 244, color: "text-green-400" },
                  { label: "Отменены", value: 8, color: "text-red-400" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border p-4" style={{ background: "hsl(220,14%,9%)" }}>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-semibold font-mono-num mt-1 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">№ Заказа</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Площадка</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Товар</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Дата</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Сумма</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ORDERS.map((o) => (
                      <tr key={o.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer">
                        <td className="px-4 py-3 font-mono-num text-xs text-primary">{o.id}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${o.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>
                            {o.platform}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground">{o.product}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{o.date}</td>
                        <td className="px-4 py-3 font-mono-num text-right text-foreground">{o.amount}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs ${STATUS_LABEL[o.status].color}`}>{STATUS_LABEL[o.status].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {activeSection === "settings" && (
            <div className="space-y-4 max-w-xl">
              {[
                {
                  title: "Профиль",
                  fields: [
                    { label: "Имя компании", value: "ИП Иванов А.В." },
                    { label: "Email", value: "seller@example.com" },
                  ],
                },
                {
                  title: "Уведомления",
                  fields: [],
                  toggles: [
                    { label: "Изменения цен конкурентов", on: true },
                    { label: "Новые требования площадок", on: true },
                    { label: "Критический остаток товаров", on: true },
                    { label: "Прогноз спроса (еженедельно)", on: false },
                  ],
                },
              ].map((section) => (
                <div key={section.title} className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                  <h2 className="text-sm font-semibold text-foreground mb-4">{section.title}</h2>
                  {section.fields?.map((f) => (
                    <div key={f.label} className="mb-3">
                      <label className="text-xs text-muted-foreground block mb-1.5">{f.label}</label>
                      <input
                        defaultValue={f.value}
                        className="w-full rounded border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                        style={{ background: "hsl(220,16%,6%)" }}
                      />
                    </div>
                  ))}
                  {section.toggles?.map((t) => (
                    <div key={t.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                      <span className="text-sm text-foreground">{t.label}</span>
                      <button
                        className={`w-9 h-5 rounded-full transition-colors relative ${t.on ? "bg-primary" : "bg-secondary"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${t.on ? "left-4" : "left-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <button className="text-sm px-4 py-2.5 rounded text-white transition-all hover:opacity-80" style={{ background: "hsl(210,100%,56%)" }}>
                Сохранить изменения
              </button>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}