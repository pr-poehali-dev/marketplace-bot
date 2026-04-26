import { useState, useMemo } from "react";
import Icon from "@/components/ui/icon";

type Section = "sync" | "analytics" | "finance" | "pricing" | "products" | "orders" | "settings";
type Platform = "all" | "ozon" | "wb";

const NAV_ITEMS: { id: Section; label: string; icon: string; badge?: number }[] = [
  { id: "sync", label: "Синхронизация", icon: "RefreshCw", badge: 2 },
  { id: "analytics", label: "Аналитика", icon: "BarChart3" },
  { id: "finance", label: "Финансы", icon: "Wallet" },
  { id: "pricing", label: "Ценовая", icon: "Tag" },
  { id: "products", label: "Товары", icon: "Package" },
  { id: "orders", label: "Заказы", icon: "ShoppingCart", badge: 14 },
  { id: "settings", label: "Настройки", icon: "Settings" },
];

const PLATFORM_TABS: { id: Platform; label: string; color: string; accent: string }[] = [
  { id: "all", label: "Все площадки", color: "#3b82f6", accent: "hsl(210,100%,56%)" },
  { id: "ozon", label: "Ozon", color: "#005BFF", accent: "#005BFF" },
  { id: "wb", label: "Wildberries", color: "#CB11AB", accent: "#CB11AB" },
];

const NOTIFICATIONS = [
  { id: 1, type: "warn", text: "Ozon: комиссия на категорию «Электроника» выросла на 2%", time: "5 мин" },
  { id: 2, type: "info", text: "WB: новые требования к маркировке товаров с 1 мая", time: "2 ч" },
  { id: 3, type: "success", text: "Прогноз спроса обновлён — 47 SKU требуют дозаказа", time: "4 ч" },
  { id: 4, type: "danger", text: "3 товара вышли из топ-100 по ключевым запросам", time: "6 ч" },
];

const DATA = {
  all: {
    stats: [
      { label: "Выручка за месяц", value: "4 821 300 ₽", delta: "+12.4%", up: true },
      { label: "Заказов сегодня", value: "347", delta: "+8.1%", up: true },
      { label: "Средний чек", value: "13 894 ₽", delta: "-2.3%", up: false },
      { label: "Маржа", value: "22.7%", delta: "+1.1%", up: true },
    ],
    chart: [42, 65, 53, 78, 91, 85, 102, 97, 118, 124, 109, 138],
    chartDelta: "+31.4%",
    finance: {
      income: "4 821 300 ₽",
      expense: "3 724 800 ₽",
      profit: "1 096 500 ₽",
      breakdown: [
        { name: "Комиссии площадок", amount: "1 446 000 ₽", pct: 38 },
        { name: "Логистика и фулфилмент", amount: "1 114 000 ₽", pct: 30 },
        { name: "Реклама и продвижение", amount: "744 000 ₽", pct: 20 },
        { name: "Хранение на складе", amount: "298 000 ₽", pct: 8 },
        { name: "Прочие расходы", amount: "122 800 ₽", pct: 4 },
      ],
    },
    products: [
      { name: "Наушники TWS Pro X12", sku: "OZ-44821", platform: "Ozon", sales: 312, revenue: "1 248 000 ₽", stock: 84 },
      { name: "Умная колонка Hori M2", sku: "WB-29103", platform: "WB", sales: 198, revenue: "891 000 ₽", stock: 12 },
      { name: "Фитнес-браслет ActFit 5", sku: "OZ-77234", platform: "Ozon", sales: 176, revenue: "704 000 ₽", stock: 203 },
      { name: "Портативный аккумулятор 20K", sku: "WB-51029", platform: "WB", sales: 145, revenue: "362 500 ₽", stock: 0 },
      { name: "Беспроводная зарядка X3", sku: "OZ-38821", platform: "Ozon", sales: 134, revenue: "268 000 ₽", stock: 67 },
    ],
    orders: [
      { id: "#OZ-48291", platform: "Ozon", product: "Наушники TWS Pro X12", date: "26 апр, 14:32", amount: "3 990 ₽", status: "new" },
      { id: "#WB-93021", platform: "WB", product: "Умная колонка Hori M2", date: "26 апр, 13:15", amount: "4 500 ₽", status: "shipping" },
      { id: "#OZ-48180", platform: "Ozon", product: "Фитнес-браслет ActFit 5", date: "26 апр, 11:48", amount: "3 999 ₽", status: "done" },
      { id: "#WB-93014", platform: "WB", product: "Портативный аккумулятор 20K", date: "26 апр, 10:20", amount: "2 500 ₽", status: "done" },
      { id: "#OZ-48099", platform: "Ozon", product: "Беспроводная зарядка X3", date: "25 апр, 22:05", amount: "1 999 ₽", status: "cancelled" },
    ],
    orderCounts: { new: 14, shipping: 89, done: 244, cancelled: 8 },
    pricing: [
      { name: "Наушники TWS Pro X12", platform: "Ozon", current: "3 990 ₽", rec: "4 290 ₽", reason: "Конкуренты подняли цену, запас маржи 18%", action: "повысить" },
      { name: "Умная колонка Hori M2", platform: "WB", current: "4 500 ₽", rec: "4 199 ₽", reason: "Падение в выдаче, цена выше рынка на 7%", action: "снизить" },
      { name: "Портативный аккумулятор 20K", platform: "WB", current: "2 500 ₽", rec: "2 500 ₽", reason: "Оптимальная цена, удерживать позицию", action: "держать" },
    ],
    forecast: [
      { name: "Наушники TWS Pro X12", platform: "Ozon", nextMonth: "+34%", stock: 84, needOrder: false },
      { name: "Умная колонка Hori M2", platform: "WB", nextMonth: "+61%", stock: 12, needOrder: true },
      { name: "Фитнес-браслет ActFit 5", platform: "Ozon", nextMonth: "+18%", stock: 203, needOrder: false },
      { name: "Портативный аккумулятор 20K", platform: "WB", nextMonth: "+29%", stock: 0, needOrder: true },
    ],
  },
  ozon: {
    stats: [
      { label: "Выручка за месяц", value: "2 641 000 ₽", delta: "+15.2%", up: true },
      { label: "Заказов сегодня", value: "198", delta: "+10.3%", up: true },
      { label: "Средний чек", value: "13 338 ₽", delta: "+2.1%", up: true },
      { label: "Маржа", value: "24.1%", delta: "+2.3%", up: true },
    ],
    chart: [22, 34, 28, 41, 49, 44, 56, 52, 64, 68, 58, 77],
    chartDelta: "+39.1%",
    finance: {
      income: "2 641 000 ₽",
      expense: "2 005 000 ₽",
      profit: "636 000 ₽",
      breakdown: [
        { name: "Комиссии Ozon", amount: "738 000 ₽", pct: 36 },
        { name: "Логистика и фулфилмент", amount: "601 000 ₽", pct: 30 },
        { name: "Реклама (Ozon Ads)", amount: "420 000 ₽", pct: 21 },
        { name: "Хранение на складе", amount: "164 000 ₽", pct: 8 },
        { name: "Прочие расходы", amount: "82 000 ₽", pct: 4 },
      ],
    },
    products: [
      { name: "Наушники TWS Pro X12", sku: "OZ-44821", platform: "Ozon", sales: 312, revenue: "1 248 000 ₽", stock: 84 },
      { name: "Фитнес-браслет ActFit 5", sku: "OZ-77234", platform: "Ozon", sales: 176, revenue: "704 000 ₽", stock: 203 },
      { name: "Беспроводная зарядка X3", sku: "OZ-38821", platform: "Ozon", sales: 134, revenue: "268 000 ₽", stock: 67 },
    ],
    orders: [
      { id: "#OZ-48291", platform: "Ozon", product: "Наушники TWS Pro X12", date: "26 апр, 14:32", amount: "3 990 ₽", status: "new" },
      { id: "#OZ-48180", platform: "Ozon", product: "Фитнес-браслет ActFit 5", date: "26 апр, 11:48", amount: "3 999 ₽", status: "done" },
      { id: "#OZ-48099", platform: "Ozon", product: "Беспроводная зарядка X3", date: "25 апр, 22:05", amount: "1 999 ₽", status: "cancelled" },
    ],
    orderCounts: { new: 9, shipping: 51, done: 138, cancelled: 5 },
    pricing: [
      { name: "Наушники TWS Pro X12", platform: "Ozon", current: "3 990 ₽", rec: "4 290 ₽", reason: "Конкуренты подняли цену, запас маржи 18%", action: "повысить" },
    ],
    forecast: [
      { name: "Наушники TWS Pro X12", platform: "Ozon", nextMonth: "+34%", stock: 84, needOrder: false },
      { name: "Фитнес-браслет ActFit 5", platform: "Ozon", nextMonth: "+18%", stock: 203, needOrder: false },
    ],
  },
  wb: {
    stats: [
      { label: "Выручка за месяц", value: "2 180 300 ₽", delta: "+9.1%", up: true },
      { label: "Заказов сегодня", value: "149", delta: "+5.7%", up: true },
      { label: "Средний чек", value: "14 632 ₽", delta: "-5.9%", up: false },
      { label: "Маржа", value: "20.8%", delta: "-0.4%", up: false },
    ],
    chart: [20, 31, 25, 37, 42, 41, 46, 45, 54, 56, 51, 61],
    chartDelta: "+22.4%",
    finance: {
      income: "2 180 300 ₽",
      expense: "1 719 800 ₽",
      profit: "460 500 ₽",
      breakdown: [
        { name: "Комиссии WB", amount: "708 000 ₽", pct: 41 },
        { name: "Логистика и фулфилмент", amount: "513 000 ₽", pct: 30 },
        { name: "Реклама (WB Ads)", amount: "324 000 ₽", pct: 19 },
        { name: "Хранение на складе", amount: "134 000 ₽", pct: 8 },
        { name: "Прочие расходы", amount: "40 800 ₽", pct: 2 },
      ],
    },
    products: [
      { name: "Умная колонка Hori M2", sku: "WB-29103", platform: "WB", sales: 198, revenue: "891 000 ₽", stock: 12 },
      { name: "Портативный аккумулятор 20K", sku: "WB-51029", platform: "WB", sales: 145, revenue: "362 500 ₽", stock: 0 },
    ],
    orders: [
      { id: "#WB-93021", platform: "WB", product: "Умная колонка Hori M2", date: "26 апр, 13:15", amount: "4 500 ₽", status: "shipping" },
      { id: "#WB-93014", platform: "WB", product: "Портативный аккумулятор 20K", date: "26 апр, 10:20", amount: "2 500 ₽", status: "done" },
    ],
    orderCounts: { new: 5, shipping: 38, done: 106, cancelled: 3 },
    pricing: [
      { name: "Умная колонка Hori M2", platform: "WB", current: "4 500 ₽", rec: "4 199 ₽", reason: "Падение в выдаче, цена выше рынка на 7%", action: "снизить" },
      { name: "Портативный аккумулятор 20K", platform: "WB", current: "2 500 ₽", rec: "2 500 ₽", reason: "Оптимальная цена, удерживать позицию", action: "держать" },
    ],
    forecast: [
      { name: "Умная колонка Hori M2", platform: "WB", nextMonth: "+61%", stock: 12, needOrder: true },
      { name: "Портативный аккумулятор 20K", platform: "WB", nextMonth: "+29%", stock: 0, needOrder: true },
    ],
  },
};

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  new: { label: "Новый", color: "text-blue-400" },
  shipping: { label: "Доставка", color: "text-yellow-400" },
  done: { label: "Выполнен", color: "text-green-400" },
  cancelled: { label: "Отменён", color: "text-red-400" },
};

const SECTIONS_WITH_PLATFORM: Section[] = ["analytics", "finance", "products", "orders", "pricing"];

function PlatformSwitcher({ active, onChange }: { active: Platform; onChange: (p: Platform) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg p-1 border border-border" style={{ background: "hsl(220,16%,6%)" }}>
      {PLATFORM_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-150"
          style={
            active === tab.id
              ? { background: tab.id === "all" ? "hsl(210,100%,56%)" : tab.color, color: "#fff" }
              : { color: "hsl(215,14%,48%)" }
          }
        >
          {tab.id !== "all" && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: active === tab.id ? "#fff" : tab.color }}
            />
          )}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Калькулятор цены ──────────────────────────────────────────────
const CALC_PRODUCTS = [
  {
    id: 1,
    name: "Наушники TWS Pro X12",
    platform: "Ozon",
    sku: "OZ-44821",
    currentPrice: 3990,
    costPrice: 1800,
    commissionPct: 8,
    logisticsCost: 220,
    storageCostPerUnit: 18,
    adsCostPerUnit: 140,
    returnRatePct: 4,
  },
  {
    id: 2,
    name: "Умная колонка Hori M2",
    platform: "WB",
    sku: "WB-29103",
    currentPrice: 4500,
    costPrice: 2100,
    commissionPct: 10,
    logisticsCost: 260,
    storageCostPerUnit: 22,
    adsCostPerUnit: 190,
    returnRatePct: 6,
  },
  {
    id: 3,
    name: "Фитнес-браслет ActFit 5",
    platform: "Ozon",
    sku: "OZ-77234",
    currentPrice: 3999,
    costPrice: 1600,
    commissionPct: 9,
    logisticsCost: 180,
    storageCostPerUnit: 14,
    adsCostPerUnit: 120,
    returnRatePct: 3,
  },
  {
    id: 4,
    name: "Портативный аккумулятор 20K",
    platform: "WB",
    sku: "WB-51029",
    currentPrice: 2500,
    costPrice: 950,
    commissionPct: 11,
    logisticsCost: 160,
    storageCostPerUnit: 12,
    adsCostPerUnit: 80,
    returnRatePct: 5,
  },
  {
    id: 5,
    name: "Беспроводная зарядка X3",
    platform: "Ozon",
    sku: "OZ-38821",
    currentPrice: 1999,
    costPrice: 700,
    commissionPct: 8,
    logisticsCost: 140,
    storageCostPerUnit: 10,
    adsCostPerUnit: 60,
    returnRatePct: 3,
  },
];

function calcMetrics(product: typeof CALC_PRODUCTS[0], price: number) {
  const commission = price * (product.commissionPct / 100);
  const returns = price * (product.returnRatePct / 100);
  const totalExpenses = product.costPrice + commission + product.logisticsCost + product.storageCostPerUnit + product.adsCostPerUnit + returns;
  const profit = price - totalExpenses;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const roi = product.costPrice > 0 ? (profit / product.costPrice) * 100 : 0;
  const breakeven = totalExpenses;
  return { commission, returns, totalExpenses, profit, margin, roi, breakeven };
}

export default function Index() {
  const [activeSection, setActiveSection] = useState<Section>("analytics");
  const [platform, setPlatform] = useState<Platform>("all");
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Pricing calculator state
  const [calcProductId, setCalcProductId] = useState<number>(1);
  const [calcPrice, setCalcPrice] = useState<string>("3990");

  const calcProduct = CALC_PRODUCTS.find((p) => p.id === calcProductId) ?? CALC_PRODUCTS[0];
  const calcPriceNum = parseFloat(calcPrice.replace(/\s/g, "")) || 0;
  const currentMetrics = useMemo(() => calcMetrics(calcProduct, calcProduct.currentPrice), [calcProduct]);
  const newMetrics = useMemo(() => calcMetrics(calcProduct, calcPriceNum), [calcProduct, calcPriceNum]);

  const d = DATA[platform];
  const maxChart = Math.max(...d.chart);
  const showPlatformSwitch = SECTIONS_WITH_PLATFORM.includes(activeSection);

  const platformAccent = PLATFORM_TABS.find((t) => t.id === platform)?.accent ?? "hsl(210,100%,56%)";

  return (
    <div className="flex h-screen bg-background overflow-hidden font-['IBM_Plex_Sans',sans-serif]">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border transition-all duration-300 ${sidebarOpen ? "w-56" : "w-14"} shrink-0`}
        style={{ background: "hsl(220,16%,7%)" }}
      >
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border h-14">
          <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ background: "hsl(210,100%,56%)" }}>
            <span className="text-xs font-bold text-white">SH</span>
          </div>
          {sidebarOpen && (
            <span className="text-sm font-semibold text-foreground tracking-tight truncate">SellerHub</span>
          )}
        </div>

        <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 relative ${
                activeSection === item.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {activeSection === item.id && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r" style={{ background: "hsl(210,100%,56%)" }} />
              )}
              <span className={activeSection === item.id ? "text-primary" : ""}>
                <Icon name={item.icon} fallback="Circle" size={16} />
              </span>
              {sidebarOpen && <span className="truncate font-medium">{item.label}</span>}
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
        <header
          className="h-14 border-b border-border flex items-center justify-between px-5 shrink-0 gap-4"
          style={{ background: "hsl(220,16%,7%)" }}
        >
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground leading-tight">
              {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
            </h1>
            <p className="text-xs text-muted-foreground">26 апреля 2026</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Platform switcher in header */}
            {showPlatformSwitch && (
              <PlatformSwitcher active={platform} onChange={setPlatform} />
            )}

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
                        <Icon name={n.type === "warn" ? "AlertTriangle" : n.type === "success" ? "TrendingUp" : n.type === "danger" ? "AlertCircle" : "Info"} fallback="Circle" size={14} />
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

            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "hsl(210,100%,56%)" }}>
              ИП
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin p-5 animate-fade-in" key={`${activeSection}-${platform}`}>

          {/* ── ANALYTICS ── */}
          {activeSection === "analytics" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {d.stats.map((s) => (
                  <div key={s.label} className="rounded-lg border border-border p-4" style={{ background: "hsl(220,14%,9%)" }}>
                    <p className="text-xs text-muted-foreground mb-2">{s.label}</p>
                    <p className="text-xl font-semibold font-mono-num text-foreground">{s.value}</p>
                    <p className={`text-xs font-mono-num mt-1 ${s.up ? "text-green-400" : "text-red-400"}`}>
                      {s.delta} к прошлому месяцу
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Выручка по месяцам</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">2025–2026 · {platform === "all" ? "все площадки" : platform === "ozon" ? "Ozon" : "Wildberries"}</p>
                  </div>
                  <span className="text-xs font-mono-num text-green-400 border border-green-400/20 bg-green-400/5 px-2 py-1 rounded">▲ {d.chartDelta} г/г</span>
                </div>
                <div className="flex items-end gap-1.5 h-32">
                  {d.chart.map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-sm chart-bar"
                        style={{
                          height: `${(val / maxChart) * 100}%`,
                          background: i === d.chart.length - 1 ? platformAccent : `${platformAccent}4D`,
                          minHeight: 4,
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">{MONTHS[i]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── COMPARE BLOCK (only "all") ── */}
              {platform === "all" && (
                <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                  <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Icon name="GitCompare" size={15} className="text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Сравнение площадок</h2>
                    </div>
                    <span className="text-xs text-muted-foreground">апрель 2026</span>
                  </div>

                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_140px_140px] border-b border-border">
                    <div className="px-5 py-2.5" />
                    <div className="px-4 py-2.5 flex items-center gap-2 border-l border-border" style={{ background: "rgba(0,91,255,0.06)" }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: "#005BFF" }} />
                      <span className="text-xs font-semibold text-blue-400">Ozon</span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center gap-2 border-l border-border" style={{ background: "rgba(203,17,171,0.06)" }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: "#CB11AB" }} />
                      <span className="text-xs font-semibold text-pink-400">Wildberries</span>
                    </div>
                  </div>

                  {[
                    {
                      label: "Выручка за месяц",
                      ozon: { val: "2 641 000 ₽", raw: 2641000 },
                      wb:   { val: "2 180 300 ₽", raw: 2180300 },
                    },
                    {
                      label: "Заказов сегодня",
                      ozon: { val: "198", raw: 198 },
                      wb:   { val: "149", raw: 149 },
                    },
                    {
                      label: "Средний чек",
                      ozon: { val: "13 338 ₽", raw: 13338 },
                      wb:   { val: "14 632 ₽", raw: 14632 },
                    },
                    {
                      label: "Маржа",
                      ozon: { val: "24.1%", raw: 24.1 },
                      wb:   { val: "20.8%", raw: 20.8 },
                    },
                    {
                      label: "Чистая прибыль",
                      ozon: { val: "636 000 ₽", raw: 636000 },
                      wb:   { val: "460 500 ₽", raw: 460500 },
                    },
                    {
                      label: "Отменённых заказов",
                      ozon: { val: "5", raw: 5 },
                      wb:   { val: "3", raw: 3 },
                      lowerIsBetter: true,
                    },
                  ].map((row, i) => {
                    const ozonWins = row.lowerIsBetter ? row.ozon.raw <= row.wb.raw : row.ozon.raw >= row.wb.raw;
                    const wbWins   = row.lowerIsBetter ? row.wb.raw <= row.ozon.raw : row.wb.raw >= row.ozon.raw;
                    const tie = row.ozon.raw === row.wb.raw;
                    return (
                      <div
                        key={row.label}
                        className={`grid grid-cols-[1fr_140px_140px] border-b border-border last:border-0 ${i % 2 === 1 ? "" : ""}`}
                      >
                        <div className="px-5 py-3 text-xs text-muted-foreground flex items-center">{row.label}</div>
                        <div
                          className="px-4 py-3 border-l border-border flex items-center justify-between"
                          style={{ background: "rgba(0,91,255,0.04)" }}
                        >
                          <span className="text-sm font-mono-num text-foreground">{row.ozon.val}</span>
                          {!tie && ozonWins && <Icon name="ChevronUp" size={13} className="text-green-400" />}
                          {!tie && !ozonWins && <Icon name="ChevronDown" size={13} className="text-red-400" />}
                        </div>
                        <div
                          className="px-4 py-3 border-l border-border flex items-center justify-between"
                          style={{ background: "rgba(203,17,171,0.04)" }}
                        >
                          <span className="text-sm font-mono-num text-foreground">{row.wb.val}</span>
                          {!tie && wbWins && <Icon name="ChevronUp" size={13} className="text-green-400" />}
                          {!tie && !wbWins && <Icon name="ChevronDown" size={13} className="text-red-400" />}
                        </div>
                      </div>
                    );
                  })}

                  {/* Bar comparison — revenue share */}
                  <div className="px-5 py-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Доля выручки</p>
                    <div className="flex h-2 rounded-full overflow-hidden gap-px">
                      <div className="h-full transition-all duration-700" style={{ width: "54.8%", background: "#005BFF" }} />
                      <div className="h-full transition-all duration-700" style={{ width: "45.2%", background: "#CB11AB" }} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-mono-num">
                      <span style={{ color: "#005BFF" }}>Ozon 54.8%</span>
                      <span style={{ color: "#CB11AB" }}>WB 45.2%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border p-5" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon name="TrendingUp" size={15} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Прогноз спроса на следующий месяц</h2>
                </div>
                <div className="space-y-2">
                  {d.forecast.map((f) => (
                    <div key={f.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm text-foreground">{f.name}</p>
                        <p className="text-xs text-muted-foreground">Остаток: {f.stock} шт.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono-num text-green-400">{f.nextMonth}</span>
                        {f.needOrder && (
                          <span className="text-xs px-2 py-0.5 rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">Дозаказ</span>
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
                {[
                  { name: "Ozon", color: "#005BFF", orders: 198, revenue: "2 641 000 ₽" },
                  { name: "Wildberries", color: "#CB11AB", orders: 149, revenue: "2 180 300 ₽" },
                ].map((p) => (
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
                      <button className="text-xs text-muted-foreground hover:text-foreground border border-border px-2.5 py-1.5 rounded transition-colors">Настроить</button>
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
                  { label: "Доходы (апрель)", value: d.finance.income, icon: "ArrowUpCircle", color: "text-green-400" },
                  { label: "Расходы (апрель)", value: d.finance.expense, icon: "ArrowDownCircle", color: "text-red-400" },
                  { label: "Чистая прибыль", value: d.finance.profit, icon: "Landmark", color: "text-blue-400" },
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
                  {d.finance.breakdown.map((e) => (
                    <div key={e.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground">{e.name}</span>
                        <span className="font-mono-num text-muted-foreground">{e.amount} · {e.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: "hsl(220,12%,16%)" }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${e.pct}%`, background: platformAccent }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 flex items-center justify-between" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="Download" size={15} />
                  Экспорт финансового отчёта · {platform === "all" ? "Все площадки" : platform === "ozon" ? "Ozon" : "Wildberries"}
                </div>
                <div className="flex gap-2">
                  {["Excel", "PDF", "CSV"].map((f) => (
                    <button key={f} className="text-xs px-3 py-1.5 rounded border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors">{f}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PRICING ── */}
          {activeSection === "pricing" && (
            <div className="space-y-4">
              {/* AI banner */}
              <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: "hsl(220,14%,9%)", borderColor: `${platformAccent}40` }}>
                <span className="text-blue-400 mt-0.5 shrink-0"><Icon name="Sparkles" size={16} /></span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Рекомендации ИИ · {platform === "all" ? "Все площадки" : platform === "ozon" ? "Ozon" : "Wildberries"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Анализ конкурентов обновлён 26 апр, 12:00</p>
                </div>
              </div>

              {/* Recs */}
              <div className="space-y-3">
                {d.pricing.map((r) => (
                  <div key={r.name} className="rounded-lg border border-border p-4" style={{ background: "hsl(220,14%,9%)" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground">{r.name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>{r.platform}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{r.reason}</p>
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
                          <button
                            className="text-xs px-3 py-1.5 rounded text-white transition-all hover:opacity-80"
                            style={{ background: platformAccent }}
                            onClick={() => {
                              const found = CALC_PRODUCTS.find((p) => p.name === r.name);
                              if (found) {
                                setCalcProductId(found.id);
                                setCalcPrice(r.rec.replace(/\s|₽/g, ""));
                              }
                            }}
                          >
                            Рассчитать
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── PRICE CALCULATOR ── */}
              <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                  <Icon name="Calculator" size={15} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Предварительный расчёт по цене</h2>
                </div>

                {/* Product selector + price input */}
                <div className="px-5 py-4 border-b border-border grid grid-cols-[1fr_auto] gap-4 items-end">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Товар</label>
                    <select
                      value={calcProductId}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setCalcProductId(id);
                        const found = CALC_PRODUCTS.find((p) => p.id === id);
                        if (found) setCalcPrice(String(found.currentPrice));
                      }}
                      className="w-full rounded border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
                      style={{ background: "hsl(220,16%,6%)" }}
                    >
                      {CALC_PRODUCTS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} · {p.platform} · {p.sku}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Новая цена продажи, ₽</label>
                    <input
                      type="number"
                      min={0}
                      value={calcPrice}
                      onChange={(e) => setCalcPrice(e.target.value)}
                      className="w-36 rounded border border-border px-3 py-2 text-sm font-mono-num text-foreground outline-none focus:border-primary/50 transition-colors"
                      style={{ background: "hsl(220,16%,6%)" }}
                    />
                  </div>
                </div>

                {/* Cost breakdown */}
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Структура затрат</p>
                  <div className="space-y-2">
                    {[
                      { label: "Себестоимость товара", value: calcProduct.costPrice, note: "фиксированная" },
                      { label: `Комиссия площадки (${calcProduct.commissionPct}%)`, value: newMetrics.commission, note: `${calcProduct.platform}` },
                      { label: "Логистика и доставка", value: calcProduct.logisticsCost, note: "за единицу" },
                      { label: "Хранение на складе", value: calcProduct.storageCostPerUnit, note: "за единицу / мес" },
                      { label: "Реклама и продвижение", value: calcProduct.adsCostPerUnit, note: "за единицу" },
                      { label: `Возвраты (${calcProduct.returnRatePct}%)`, value: newMetrics.returns, note: "оценка" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-foreground">{row.label}</span>
                          <span className="text-[10px] text-muted-foreground">· {row.note}</span>
                        </div>
                        <span className="text-xs font-mono-num text-muted-foreground">{row.value.toFixed(0)} ₽</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Итого затрат</span>
                      <span className="text-xs font-mono-num font-semibold text-foreground">{newMetrics.totalExpenses.toFixed(0)} ₽</span>
                    </div>
                  </div>
                </div>

                {/* Key metrics comparison */}
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ключевые показатели</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      {
                        label: "Прибыль с единицы",
                        current: currentMetrics.profit,
                        next: newMetrics.profit,
                        fmt: (v: number) => `${v.toFixed(0)} ₽`,
                        higherBetter: true,
                      },
                      {
                        label: "Маржа",
                        current: currentMetrics.margin,
                        next: newMetrics.margin,
                        fmt: (v: number) => `${v.toFixed(1)}%`,
                        higherBetter: true,
                      },
                      {
                        label: "ROI",
                        current: currentMetrics.roi,
                        next: newMetrics.roi,
                        fmt: (v: number) => `${v.toFixed(1)}%`,
                        higherBetter: true,
                      },
                      {
                        label: "Точка безубыточности",
                        current: currentMetrics.breakeven,
                        next: newMetrics.breakeven,
                        fmt: (v: number) => `${v.toFixed(0)} ₽`,
                        higherBetter: false,
                      },
                    ].map((m) => {
                      const delta = m.next - m.current;
                      const better = m.higherBetter ? delta > 0 : delta < 0;
                      const worse  = m.higherBetter ? delta < 0 : delta > 0;
                      return (
                        <div key={m.label} className="rounded-lg p-3" style={{ background: "hsl(220,16%,6%)" }}>
                          <p className="text-[10px] text-muted-foreground mb-1.5 leading-tight">{m.label}</p>
                          <p className="text-xs text-muted-foreground font-mono-num line-through mb-0.5">{m.fmt(m.current)}</p>
                          <p className={`text-base font-semibold font-mono-num ${better ? "text-green-400" : worse ? "text-red-400" : "text-foreground"}`}>
                            {m.fmt(m.next)}
                          </p>
                          {delta !== 0 && (
                            <p className={`text-[10px] font-mono-num mt-1 ${better ? "text-green-400" : "text-red-400"}`}>
                              {delta > 0 ? "+" : ""}{m.fmt(delta)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Verdict */}
                <div className="px-5 py-4">
                  {(() => {
                    const profitOk = newMetrics.profit > 0;
                    const marginOk = newMetrics.margin >= 15;
                    const roiOk    = newMetrics.roi >= 20;
                    const score    = [profitOk, marginOk, roiOk].filter(Boolean).length;
                    const verdictColor = score === 3 ? "text-green-400" : score === 2 ? "text-yellow-400" : "text-red-400";
                    const verdictBg    = score === 3 ? "rgba(74,222,128,0.07)" : score === 2 ? "rgba(250,204,21,0.07)" : "rgba(248,113,113,0.07)";
                    const verdictBorder= score === 3 ? "rgba(74,222,128,0.2)" : score === 2 ? "rgba(250,204,21,0.2)" : "rgba(248,113,113,0.2)";
                    const verdictText  = score === 3
                      ? "Цена оптимальна — прибыль, маржа и ROI в норме. Можно применять."
                      : score === 2
                      ? "Цена приемлема, но часть показателей ниже цели. Проверьте риски."
                      : "Цена невыгодна — один или несколько ключевых показателей критичны.";
                    return (
                      <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: verdictBg, borderColor: verdictBorder }}>
                        <Icon name={score === 3 ? "CheckCircle2" : score === 2 ? "AlertTriangle" : "XCircle"} size={16} className={verdictColor} />
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${verdictColor}`}>
                            {score === 3 ? "Цена выгодна" : score === 2 ? "Приемлемо" : "Невыгодно"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{verdictText}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {[
                            { ok: profitOk, label: "Прибыль" },
                            { ok: marginOk, label: "Маржа ≥15%" },
                            { ok: roiOk,    label: "ROI ≥20%" },
                          ].map((c) => (
                            <span
                              key={c.label}
                              className={`text-[10px] px-2 py-0.5 rounded border font-medium ${c.ok ? "text-green-400 border-green-400/25 bg-green-400/8" : "text-red-400 border-red-400/25 bg-red-400/8"}`}
                            >
                              {c.ok ? "✓" : "✗"} {c.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
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
                <button className="flex items-center gap-2 text-sm px-4 py-2 rounded text-white" style={{ background: platformAccent }}>
                  <Icon name="Plus" size={14} />
                  Добавить товар
                </button>
              </div>
              <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Товар</th>
                      {platform === "all" && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Площадка</th>}
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">SKU</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Продажи</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Выручка</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Остаток</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.products.map((p) => (
                      <tr key={p.sku} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer">
                        <td className="px-4 py-3 text-foreground">{p.name}</td>
                        {platform === "all" && (
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${p.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>{p.platform}</span>
                          </td>
                        )}
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
                  { label: "Новые", value: d.orderCounts.new, color: "text-blue-400" },
                  { label: "Доставка", value: d.orderCounts.shipping, color: "text-yellow-400" },
                  { label: "Выполнены", value: d.orderCounts.done, color: "text-green-400" },
                  { label: "Отменены", value: d.orderCounts.cancelled, color: "text-red-400" },
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
                      {platform === "all" && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Площадка</th>}
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Товар</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Дата</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Сумма</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.orders.map((o) => (
                      <tr key={o.id} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer">
                        <td className="px-4 py-3 font-mono-num text-xs" style={{ color: platformAccent }}>{o.id}</td>
                        {platform === "all" && (
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${o.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>{o.platform}</span>
                          </td>
                        )}
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
                  toggles: [],
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
                  {section.fields.map((f) => (
                    <div key={f.label} className="mb-3">
                      <label className="text-xs text-muted-foreground block mb-1.5">{f.label}</label>
                      <input
                        defaultValue={f.value}
                        className="w-full rounded border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                        style={{ background: "hsl(220,16%,6%)" }}
                      />
                    </div>
                  ))}
                  {section.toggles.map((t) => (
                    <div key={t.label} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                      <span className="text-sm text-foreground">{t.label}</span>
                      <button className={`w-9 h-5 rounded-full transition-colors relative ${t.on ? "bg-primary" : "bg-secondary"}`}>
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