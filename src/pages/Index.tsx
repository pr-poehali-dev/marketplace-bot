import { useState, useMemo, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { useAuth } from "@/hooks/useAuth";
import { apiGetProducts, apiGetPrices, apiSavePrice, apiSyncProducts, apiGetRecommendations, apiGetPriceHistory, apiGetRules, apiCreateRule, apiUpdateRule } from "@/lib/api";

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

// ── Price History Modal ───────────────────────────────────────────
interface HistoryEntry {
  id: string;
  sku: string;
  old_price: number;
  new_price: number;
  source: string;
  created_at: string;
}

function PriceHistoryModal({ sku, name, onClose }: { sku: string; name: string; onClose: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetPriceHistory(sku).then((data) => {
      if (data?.history) setHistory(data.history);
      setLoading(false);
    });
  }, [sku]);

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  }

  const sourceLabel: Record<string, string> = {
    manual: "Вручную",
    recommendation: "Рекомендация",
    calculator: "Калькулятор",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border overflow-hidden"
        style={{ background: "hsl(220,14%,9%)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground">История цен</p>
            <p className="text-xs text-muted-foreground mt-0.5">{name} · {sku}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Icon name="Loader2" size={16} className="animate-spin" />
              <span className="text-sm">Загрузка...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Icon name="Clock" size={24} className="opacity-30" />
              <p className="text-sm">История изменений пуста</p>
              <p className="text-xs opacity-60">Цена ещё не менялась</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-8 top-0 bottom-0 w-px" style={{ background: "hsl(220,12%,18%)" }} />
              <div className="py-4 space-y-0">
                {history.map((entry, idx) => {
                  const delta = entry.new_price - entry.old_price;
                  const isUp = delta > 0;
                  const color = isUp ? "text-green-400" : "text-red-400";
                  const dotColor = isUp ? "#4ade80" : "#f87171";
                  return (
                    <div key={entry.id} className="flex gap-4 px-5 py-3 hover:bg-secondary/30 transition-colors">
                      {/* Dot */}
                      <div className="relative z-10 shrink-0 mt-1">
                        <div
                          className="w-3 h-3 rounded-full border-2"
                          style={{ background: idx === 0 ? dotColor : "hsl(220,14%,9%)", borderColor: dotColor }}
                        />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-mono-num font-medium text-muted-foreground line-through">
                              {entry.old_price.toLocaleString("ru-RU")} ₽
                            </span>
                            <Icon name="ArrowRight" size={12} className="text-muted-foreground shrink-0" />
                            <span className={`text-sm font-mono-num font-semibold ${color}`}>
                              {entry.new_price.toLocaleString("ru-RU")} ₽
                            </span>
                            <span className={`text-xs font-mono-num ${color}`}>
                              ({isUp ? "+" : ""}{delta.toLocaleString("ru-RU")} ₽ / {isUp ? "+" : ""}{((delta / (entry.old_price || 1)) * 100).toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground" style={{ background: "hsl(220,16%,6%)" }}>
                            {sourceLabel[entry.source] ?? entry.source}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{formatDate(entry.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{history.length} записей</span>
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Price Calc Dialog ─────────────────────────────────────────────
function PriceCalcDialog({
  product,
  initialPrice,
  onClose,
  onApply,
}: {
  product: typeof CALC_PRODUCTS[0];
  initialPrice?: number;
  onClose: () => void;
  onApply: (price: number) => void;
}) {
  const [calcPrice, setCalcPrice] = useState<string>(String(initialPrice ?? product.currentPrice));
  const calcPriceNum = parseFloat(calcPrice) || 0;
  const currentMetrics = useMemo(() => calcMetrics(product, product.currentPrice), [product]);
  const newMetrics = useMemo(() => calcMetrics(product, calcPriceNum), [product, calcPriceNum]);
  const accent = product.platform === "Ozon" ? "#005BFF" : "#CB11AB";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border overflow-hidden animate-slide-up"
        style={{ background: "hsl(220,14%,9%)", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0" style={{ background: "hsl(220,14%,9%)" }}>
          <div className="flex items-center gap-2.5">
            <Icon name="Calculator" size={15} className="text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">{product.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${product.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>{product.platform}</span>
                <span className="text-[10px] text-muted-foreground font-mono-num">{product.sku}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Slider + input */}
        <div className="px-5 py-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Цена продажи</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={product.costPrice}
                max={product.currentPrice * 2}
                value={calcPrice}
                onChange={(e) => setCalcPrice(e.target.value)}
                className="w-28 rounded border border-border px-3 py-1.5 text-sm font-mono-num text-foreground outline-none focus:border-primary/50 transition-colors text-right"
                style={{ background: "hsl(220,16%,6%)" }}
              />
              <span className="text-sm text-muted-foreground">₽</span>
            </div>
          </div>
          <input
            type="range"
            min={product.costPrice}
            max={product.currentPrice * 2}
            step={10}
            value={calcPriceNum || product.currentPrice}
            onChange={(e) => setCalcPrice(e.target.value)}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: (() => {
                const min = product.costPrice;
                const max = product.currentPrice * 2;
                const pct = Math.min(100, Math.max(0, ((calcPriceNum - min) / (max - min)) * 100));
                return `linear-gradient(to right, ${accent} ${pct}%, hsl(220,12%,20%) ${pct}%)`;
              })(),
            }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono-num">
            <span>{product.costPrice} ₽ <span className="opacity-60">себест.</span></span>
            <span>{product.currentPrice} ₽ <span className="opacity-60">текущая</span></span>
            <span>{product.currentPrice * 2} ₽ <span className="opacity-60">макс.</span></span>
          </div>
          {calcPriceNum !== product.currentPrice && calcPriceNum > 0 && (
            <p className={`text-xs font-mono-num ${calcPriceNum > product.currentPrice ? "text-green-400" : "text-red-400"}`}>
              {calcPriceNum > product.currentPrice ? "+" : ""}
              {(calcPriceNum - product.currentPrice).toFixed(0)} ₽
              ({calcPriceNum > product.currentPrice ? "+" : ""}
              {(((calcPriceNum - product.currentPrice) / product.currentPrice) * 100).toFixed(1)}%) от текущей
            </p>
          )}
        </div>

        {/* Metrics cards */}
        <div className="px-5 py-4 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ключевые показатели</p>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Прибыль", current: currentMetrics.profit, next: newMetrics.profit, fmt: (v: number) => `${v.toFixed(0)} ₽`, higherBetter: true },
              { label: "Маржа", current: currentMetrics.margin, next: newMetrics.margin, fmt: (v: number) => `${v.toFixed(1)}%`, higherBetter: true },
              { label: "ROI", current: currentMetrics.roi, next: newMetrics.roi, fmt: (v: number) => `${v.toFixed(1)}%`, higherBetter: true },
              { label: "Безубыточность", current: currentMetrics.breakeven, next: newMetrics.breakeven, fmt: (v: number) => `${v.toFixed(0)} ₽`, higherBetter: false },
            ].map((m) => {
              const delta = m.next - m.current;
              const better = m.higherBetter ? delta > 0 : delta < 0;
              const worse = m.higherBetter ? delta < 0 : delta > 0;
              return (
                <div key={m.label} className="rounded-lg p-3" style={{ background: "hsl(220,16%,6%)" }}>
                  <p className="text-[10px] text-muted-foreground mb-1.5">{m.label}</p>
                  <p className="text-xs text-muted-foreground font-mono-num line-through mb-0.5">{m.fmt(m.current)}</p>
                  <p className={`text-base font-semibold font-mono-num ${better ? "text-green-400" : worse ? "text-red-400" : "text-foreground"}`}>{m.fmt(m.next)}</p>
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

        {/* Cost breakdown */}
        <div className="px-5 py-4 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Структура затрат</p>
          <div className="space-y-2">
            {[
              { label: "Себестоимость товара", value: product.costPrice, note: "фиксированная" },
              { label: `Комиссия площадки (${product.commissionPct}%)`, value: newMetrics.commission, note: product.platform },
              { label: "Логистика и доставка", value: product.logisticsCost, note: "за единицу" },
              { label: "Хранение на складе", value: product.storageCostPerUnit, note: "за единицу / мес" },
              { label: "Реклама и продвижение", value: product.adsCostPerUnit, note: "за единицу" },
              { label: `Возвраты (${product.returnRatePct}%)`, value: newMetrics.returns, note: "оценка" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
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

        {/* Verdict */}
        <div className="px-5 py-4">
          {(() => {
            const profitOk = newMetrics.profit > 0;
            const marginOk = newMetrics.margin >= 15;
            const roiOk = newMetrics.roi >= 20;
            const score = [profitOk, marginOk, roiOk].filter(Boolean).length;
            const vColor = score === 3 ? "text-green-400" : score === 2 ? "text-yellow-400" : "text-red-400";
            const vBg = score === 3 ? "rgba(74,222,128,0.07)" : score === 2 ? "rgba(250,204,21,0.07)" : "rgba(248,113,113,0.07)";
            const vBorder = score === 3 ? "rgba(74,222,128,0.2)" : score === 2 ? "rgba(250,204,21,0.2)" : "rgba(248,113,113,0.2)";
            const vText = score === 3 ? "Цена оптимальна — прибыль, маржа и ROI в норме."
              : score === 2 ? "Цена приемлема, но часть показателей ниже цели."
              : "Цена невыгодна — ключевые показатели критичны.";
            return (
              <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: vBg, borderColor: vBorder }}>
                <Icon name={score === 3 ? "CheckCircle2" : score === 2 ? "AlertTriangle" : "XCircle"} size={16} className={vColor} />
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${vColor}`}>{score === 3 ? "Цена выгодна" : score === 2 ? "Приемлемо" : "Невыгодно"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{vText}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {[{ ok: profitOk, label: "Прибыль" }, { ok: marginOk, label: "Маржа ≥15%" }, { ok: roiOk, label: "ROI ≥20%" }].map((c) => (
                    <span key={c.label} className={`text-[10px] px-2 py-0.5 rounded border font-medium ${c.ok ? "text-green-400 border-green-400/25 bg-green-400/10" : "text-red-400 border-red-400/25 bg-red-400/10"}`}>
                      {c.ok ? "✓" : "✗"} {c.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3 sticky bottom-0" style={{ background: "hsl(220,14%,9%)" }}>
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
          >
            Отмена
          </button>
          <button
            onClick={() => { onApply(calcPriceNum); onClose(); }}
            disabled={calcPriceNum <= 0 || calcPriceNum === product.currentPrice}
            className="flex items-center gap-2 text-sm px-5 py-2 rounded text-white font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: product.platform === "Ozon" ? "#005BFF" : "#CB11AB" }}
          >
            <Icon name="Check" size={14} />
            Применить цену · {calcPriceNum > 0 ? calcPriceNum.toLocaleString("ru-RU") : "—"} ₽
          </button>
        </div>
      </div>
    </div>
  );
}

interface Recommendation {
  sku: string;
  name: string;
  platform: string;
  action: "increase" | "decrease" | "keep";
  recommended_price: number;
  current_price: number;
  current_margin: number;
  expected_margin: number;
  reason: string;
}

interface DBProduct {
  sku: string;
  name: string;
  platform: string;
  current_price: number;
  cost_price: number;
  commission_pct: number;
  logistics_cost: number;
  storage_cost_per_unit: number;
  ads_cost_per_unit: number;
  return_rate_pct: number;
  sales: number;
  stock: number;
  revenue: number;
  applied_price: number;
  updated_at: string;
}

function dbProductToCalc(p: DBProduct): typeof CALC_PRODUCTS[0] {
  return {
    id: 0,
    name: p.name,
    sku: p.sku,
    platform: p.platform as "Ozon" | "WB",
    currentPrice: p.current_price,
    costPrice: p.cost_price,
    commissionPct: p.commission_pct,
    logisticsCost: p.logistics_cost,
    storageCostPerUnit: p.storage_cost_per_unit,
    adsCostPerUnit: p.ads_cost_per_unit,
    returnRatePct: p.return_rate_pct,
  };
}

export default function Index() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("analytics");
  const [platform, setPlatform] = useState<Platform>("all");
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // DB products state
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncCooldown, setSyncCooldown] = useState(false);

  // Price history modal
  const [historyModal, setHistoryModal] = useState<{ sku: string; name: string } | null>(null);

  // Plan limit error
  const [limitError, setLimitError] = useState<{ msg: string; plan: string; limit: number; current: number } | null>(null);

  // Pricing rules
  interface PricingRule { id: string; type: string; value: number; enabled: boolean; label: string; description: string; value_label: string; }
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [newRuleType, setNewRuleType] = useState("increase_margin");
  const [newRuleValue, setNewRuleValue] = useState("20");
  const [rulesSaving, setRulesSaving] = useState(false);
  const RULE_TYPE_META: Record<string, { label: string; description: string; value_label: string; default: number }> = {
    increase_margin: { label: "Повысить маржу", description: "Если маржа < порога — поднять цену до целевой", value_label: "Целевая маржа (%)", default: 20 },
    beat_competitor: { label: "Обойти конкурента", description: "Снизить цену на X% при падении продаж", value_label: "Снижение цены (%)", default: 5 },
    min_margin:      { label: "Минимальная маржа", description: "Не допускать маржу ниже X%", value_label: "Мин. маржа (%)", default: 10 },
    max_discount:    { label: "Максимальная скидка", description: "Не снижать цену более чем на X%", value_label: "Макс. скидка (%)", default: 15 },
  };

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    const data = await apiGetRules();
    if (data?.rules) setRules(data.rules);
    setRulesLoading(false);
  }, []);

  useEffect(() => { if (activeSection === "settings") loadRules(); }, [activeSection, loadRules]);

  // Dialog state
  const [calcDialogProduct, setCalcDialogProduct] = useState<typeof CALC_PRODUCTS[0] | null>(null);
  const [calcDialogInitPrice, setCalcDialogInitPrice] = useState<number | undefined>(undefined);
  // sku → applied price (local + synced from DB)
  const [appliedPrices, setAppliedPrices] = useState<Record<string, number>>({});
  // sku → recommendation
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation>>({});

  // Load products + prices + recommendations from DB
  const loadData = useCallback(async () => {
    const [prodData, priceData, recData] = await Promise.all([
      apiGetProducts(), apiGetPrices(), apiGetRecommendations(),
    ]);
    if (prodData?.products) {
      setDbProducts(prodData.products);
      // sync_log
      if (prodData.last_sync?.length > 0) {
        setLastSyncTime(prodData.last_sync[0].finished_at);
        // check cooldown (last success < 1h ago)
        const lastSuccess = prodData.last_sync.find((s: { status: string }) => s.status === "success");
        if (lastSuccess) {
          const diff = Date.now() - new Date(lastSuccess.started_at).getTime();
          setSyncCooldown(diff < 60 * 60 * 1000);
        }
      }
    }
    if (priceData?.prices) {
      const mapped: Record<string, number> = {};
      for (const [sku, val] of Object.entries(priceData.prices)) {
        mapped[sku] = (val as { price: number }).price;
      }
      setAppliedPrices(mapped);
    }
    if (recData?.recommendations) {
      const mapped: Record<string, Recommendation> = {};
      for (const rec of recData.recommendations as Recommendation[]) {
        mapped[rec.sku] = rec;
      }
      setRecommendations(mapped);
    }
    setDbLoaded(true);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function openCalcDialog(productName: string, initPrice?: number) {
    // Try DB product first, fallback to static CALC_PRODUCTS
    const dbP = dbProducts.find((p) => p.name === productName);
    if (dbP) {
      setCalcDialogProduct(dbProductToCalc(dbP));
      setCalcDialogInitPrice(initPrice ?? appliedPrices[dbP.sku] ?? dbP.current_price);
      return;
    }
    const found = CALC_PRODUCTS.find((p) => p.name === productName);
    if (found) {
      setCalcDialogProduct(found);
      setCalcDialogInitPrice(initPrice ?? appliedPrices[found.sku] ?? found.currentPrice);
    }
  }

  async function applyPrice(price: number) {
    if (!calcDialogProduct) return;
    await applyPriceBySku(calcDialogProduct.sku, price, "calculator");
  }

  async function applyPriceBySku(sku: string, price: number, source = "manual") {
    setAppliedPrices((prev) => ({ ...prev, [sku]: price }));
    await apiSavePrice(sku, price, source);
  }

  async function handleSync() {
    if (syncing || syncCooldown) return;
    setSyncing(true);
    setSyncError("");
    setLimitError(null);
    const data = await apiSyncProducts("all");
    if (data?.error) {
      // Ошибка лимита тарифа
      if (data.plan && data.limit !== undefined) {
        setLimitError({ msg: data.error, plan: data.plan, limit: data.limit, current: data.current });
      } else {
        setSyncError(data.error);
      }
    } else {
      // Сразу блокируем кнопку и показываем время
      const now = new Date().toISOString();
      setLastSyncTime(now);
      setSyncCooldown(true);
      // Снимаем cooldown ровно через час
      setTimeout(() => setSyncCooldown(false), 60 * 60 * 1000);
      // Перезагружаем таблицу из БД
      await loadData();
    }
    setSyncing(false);
  }



  const d = DATA[platform];
  const maxChart = Math.max(...d.chart);
  const showPlatformSwitch = SECTIONS_WITH_PLATFORM.includes(activeSection);

  const platformAccent = PLATFORM_TABS.find((t) => t.id === platform)?.accent ?? "hsl(210,100%,56%)";

  return (
    <div className="flex h-screen bg-background overflow-hidden font-['IBM_Plex_Sans',sans-serif]">
      {/* Price history modal */}
      {historyModal && (
        <PriceHistoryModal
          sku={historyModal.sku}
          name={historyModal.name}
          onClose={() => setHistoryModal(null)}
        />
      )}

      {/* Price calc dialog */}
      {calcDialogProduct && (
        <PriceCalcDialog
          product={calcDialogProduct}
          initialPrice={calcDialogInitPrice}
          onClose={() => setCalcDialogProduct(null)}
          onApply={applyPrice}
        />
      )}

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

            <div className="flex items-center gap-2">
              {/* Plan badge */}
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider"
                style={user?.plan === "pro"
                  ? { background: "rgba(250,204,21,0.15)", color: "#fbbf24", border: "1px solid rgba(250,204,21,0.3)" }
                  : { background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" }
                }
              >
                {user?.plan?.toUpperCase() ?? "FREE"}
              </span>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "hsl(210,100%,56%)" }}>
                {user?.name ? user.name[0].toUpperCase() : "U"}
              </div>
              {sidebarOpen && (
                <button
                  onClick={logout}
                  title="Выйти"
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <Icon name="LogOut" size={14} />
                </button>
              )}
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
                {d.pricing.map((r) => {
                  const calcP = CALC_PRODUCTS.find((cp) => cp.name === r.name);
                  const appliedPrice = calcP ? appliedPrices[calcP.sku] : undefined;
                  const isChanged = appliedPrice !== undefined;
                  return (
                  <div key={r.name} className="rounded-lg border border-border p-4" style={{ background: "hsl(220,14%,9%)" }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground">{r.name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${r.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>{r.platform}</span>
                          {isChanged && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">обновлена</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{r.reason}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Текущая</p>
                          {isChanged ? (
                            <div>
                              <p className="text-xs text-muted-foreground line-through">{r.current}</p>
                              <p className="text-sm font-mono-num text-emerald-400">{appliedPrice!.toLocaleString("ru-RU")} ₽</p>
                            </div>
                          ) : (
                            <p className="text-sm font-mono-num text-foreground">{r.current}</p>
                          )}
                        </div>
                        <Icon name="ArrowRight" size={14} className="text-muted-foreground" />
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Рекомендуемая</p>
                          <p className={`text-sm font-mono-num ${r.action === "повысить" ? "text-green-400" : r.action === "снизить" ? "text-red-400" : "text-muted-foreground"}`}>{r.rec}</p>
                        </div>
                        <button
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all"
                          onClick={() => openCalcDialog(r.name)}
                        >
                          <Icon name="BarChart2" size={12} />
                          Детали
                        </button>
                        {r.action !== "держать" && (
                          <button
                            className="text-xs px-3 py-1.5 rounded text-white transition-all hover:opacity-80"
                            style={{ background: platformAccent }}
                            onClick={() => openCalcDialog(r.name, Number(r.rec.replace(/\s|₽/g, "")))}
                          >
                            Рассчитать
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* ── PRODUCTS ── */}
          {activeSection === "products" && (
            <div className="space-y-4">

              {/* Лимит тарифа */}
              {limitError && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/8 p-4 flex items-start gap-3">
                  <Icon name="ShieldAlert" size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-400">Превышен лимит тарифа {limitError.plan.toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground mt-1">{limitError.msg}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(220,12%,20%)" }}>
                        <div
                          className="h-full rounded-full bg-red-400 transition-all"
                          style={{ width: `${Math.min(100, (limitError.current / limitError.limit) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono-num text-red-400 shrink-0">
                        {limitError.current} / {limitError.limit} товаров
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setLimitError(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <Icon name="X" size={14} />
                  </button>
                </div>
              )}

              {/* Прогресс-бар лимита (когда нет ошибки) */}
              {!limitError && dbLoaded && dbProducts.length > 0 && user && (() => {
                const limit = user.plan === "pro" ? 500 : 50;
                const pct = Math.min(100, (dbProducts.length / limit) * 100);
                const warn = pct >= 80;
                return (
                  <div className="flex items-center gap-3 px-1">
                    <span className="text-xs text-muted-foreground shrink-0">{dbProducts.length} / {limit} товаров</span>
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "hsl(220,12%,16%)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: warn ? "#f87171" : "#4ade80" }}
                      />
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                      style={user.plan === "pro"
                        ? { background: "rgba(250,204,21,0.15)", color: "#fbbf24" }
                        : { background: "rgba(148,163,184,0.1)", color: "#94a3b8" }
                      }
                    >
                      {user.plan.toUpperCase()}
                    </span>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 border border-border rounded px-3 py-2 w-64" style={{ background: "hsl(220,14%,9%)" }}>
                  <Icon name="Search" size={14} className="text-muted-foreground" />
                  <input className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" placeholder="Поиск по каталогу..." />
                </div>
                <div className="flex items-center gap-2">
                  {/* Sync info */}
                  {lastSyncTime && (
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      Обновлено: {new Date(lastSyncTime).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {syncError && (
                    <span className="text-xs text-red-400 max-w-xs truncate">{syncError}</span>
                  )}
                  <button
                    onClick={handleSync}
                    disabled={syncing || syncCooldown}
                    title={syncCooldown ? "Синхронизация доступна раз в час" : "Синхронизировать товары"}
                    className="flex items-center gap-1.5 text-sm px-3 py-2 rounded border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon name="RefreshCw" size={14} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Синхронизация..." : syncCooldown ? "Недоступно (1ч)" : "Синхронизировать"}
                  </button>
                  <button className="flex items-center gap-2 text-sm px-4 py-2 rounded text-white" style={{ background: platformAccent }}>
                    <Icon name="Plus" size={14} />
                    Добавить товар
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Товар</th>
                      {platform === "all" && <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Площадка</th>}
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">SKU</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Цена</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Продажи</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Выручка</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Прибыль</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Маржа</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Остаток</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Рекомендация</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {/* Loading state */}
                    {!dbLoaded && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          <Icon name="Loader2" size={16} className="animate-spin inline mr-2" />
                          Загрузка товаров...
                        </td>
                      </tr>
                    )}
                    {/* DB products (after sync) */}
                    {dbLoaded && dbProducts.length > 0 && (() => {
                      const filtered = platform === "all"
                        ? dbProducts
                        : dbProducts.filter((p) => (platform === "ozon" ? p.platform === "Ozon" : p.platform === "WB"));
                      return filtered.map((p) => {
                        const appliedPrice = appliedPrices[p.sku] ?? p.current_price;
                        const isChanged = appliedPrices[p.sku] !== undefined;
                        const newRevenue = appliedPrice * p.sales;
                        const origRevenue = p.current_price * p.sales;
                        const commission = appliedPrice * (p.commission_pct / 100);
                        const profit = appliedPrice - p.cost_price - commission - p.logistics_cost;
                        const margin = appliedPrice > 0 ? (profit / appliedPrice) * 100 : 0;
                        const profitColor = profit > 0 ? "text-green-400" : profit < 0 ? "text-red-400" : "text-muted-foreground";
                        const rec = recommendations[p.sku];
                        const recColor = rec?.action === "increase"
                          ? { text: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/25", icon: "TrendingUp" }
                          : rec?.action === "decrease"
                          ? { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/25", icon: "TrendingDown" }
                          : { text: "text-muted-foreground", bg: "bg-secondary", border: "border-border", icon: "Minus" };
                        return (
                          <tr key={p.sku} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                            <td className="px-4 py-3 text-foreground">{p.name}</td>
                            {platform === "all" && (
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${p.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>{p.platform}</span>
                              </td>
                            )}
                            <td className="px-4 py-3 font-mono-num text-xs text-muted-foreground">{p.sku}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isChanged && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">обновлена</span>}
                                <span className={`text-sm font-mono-num font-medium ${isChanged ? "text-emerald-400" : "text-foreground"}`}>
                                  {appliedPrice.toLocaleString("ru-RU")} ₽
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono-num text-right text-foreground">{p.sales}</td>
                            <td className="px-4 py-3 font-mono-num text-right">
                              <div className="flex flex-col items-end">
                                {isChanged && <span className="text-[10px] text-muted-foreground line-through">{origRevenue.toLocaleString("ru-RU")} ₽</span>}
                                <span className={isChanged ? "text-emerald-400" : "text-foreground"}>
                                  {newRevenue.toLocaleString("ru-RU")} ₽
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono-num text-right">
                              <span className={`font-medium ${profitColor}`}>
                                {profit >= 0 ? "+" : ""}{profit.toFixed(0)} ₽
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono-num text-right">
                              <span className={`font-medium ${profitColor}`}>
                                {margin.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono-num text-right">
                              <span className={p.stock === 0 ? "text-red-400" : p.stock < 20 ? "text-yellow-400" : "text-green-400"}>
                                {p.stock === 0 ? "Нет" : p.stock}
                              </span>
                            </td>
                            {/* Рекомендация */}
                            <td className="px-4 py-3 min-w-[200px]">
                              {rec && rec.action !== "keep" ? (
                                <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${recColor.bg} ${recColor.border}`}>
                                  <Icon name={recColor.icon} fallback="TrendingUp" size={13} className={`${recColor.text} shrink-0 mt-0.5`} />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[11px] font-medium ${recColor.text} leading-tight mb-1`}>
                                      {rec.recommended_price.toLocaleString("ru-RU")} ₽
                                      <span className="text-muted-foreground font-normal ml-1">
                                        → маржа {rec.expected_margin}%
                                      </span>
                                    </p>
                                    <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{rec.reason}</p>
                                    <button
                                      onClick={() => applyPriceBySku(p.sku, rec.recommended_price, "recommendation")}
                                      className={`mt-1.5 text-[10px] px-2 py-0.5 rounded border font-medium transition-all hover:opacity-80 ${recColor.text} ${recColor.border} ${recColor.bg}`}
                                    >
                                      Применить рекомендацию
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setHistoryModal({ sku: p.sku, name: p.name })}
                                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all"
                                  title="История цен"
                                >
                                  <Icon name="Clock" size={11} />
                                  История
                                </button>
                                <button
                                  onClick={() => openCalcDialog(p.name)}
                                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all"
                                >
                                  <Icon name="BarChart2" size={11} />
                                  Детали
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                    {/* Static fallback (before first sync) */}
                    {dbLoaded && dbProducts.length === 0 && d.products.map((p) => {
                      const calcP = CALC_PRODUCTS.find((cp) => cp.sku === p.sku);
                      const basePrice = calcP?.currentPrice ?? 0;
                      const appliedPrice = calcP ? (appliedPrices[calcP.sku] ?? basePrice) : basePrice;
                      const isChanged = calcP && appliedPrices[calcP.sku] !== undefined;
                      const newRevenue = calcP ? (appliedPrice * p.sales) : null;
                      const commission = calcP ? appliedPrice * (calcP.commissionPct / 100) : 0;
                      const profit = calcP ? appliedPrice - calcP.costPrice - commission - calcP.logisticsCost : 0;
                      const margin = appliedPrice > 0 && calcP ? (profit / appliedPrice) * 100 : 0;
                      const profitColor = profit > 0 ? "text-green-400" : profit < 0 ? "text-red-400" : "text-muted-foreground";
                      return (
                        <tr key={p.sku} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                          <td className="px-4 py-3 text-foreground">{p.name}</td>
                          {platform === "all" && (
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${p.platform === "Ozon" ? "text-blue-400 bg-blue-400/10" : "text-pink-400 bg-pink-400/10"}`}>{p.platform}</span>
                            </td>
                          )}
                          <td className="px-4 py-3 font-mono-num text-xs text-muted-foreground">{p.sku}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isChanged && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20">обновлена</span>}
                              <span className={`text-sm font-mono-num font-medium ${isChanged ? "text-emerald-400" : "text-foreground"}`}>
                                {appliedPrice.toLocaleString("ru-RU")} ₽
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono-num text-right text-foreground">{p.sales}</td>
                          <td className="px-4 py-3 font-mono-num text-right">
                            {newRevenue !== null ? (
                              <div className="flex flex-col items-end">
                                {isChanged && <span className="text-[10px] text-muted-foreground line-through">{p.revenue}</span>}
                                <span className={isChanged ? "text-emerald-400" : "text-foreground"}>
                                  {newRevenue.toLocaleString("ru-RU")} ₽
                                </span>
                              </div>
                            ) : (
                              <span className="text-foreground">{p.revenue}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono-num text-right">
                            {calcP ? (
                              <span className={`font-medium ${profitColor}`}>
                                {profit >= 0 ? "+" : ""}{profit.toFixed(0)} ₽
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono-num text-right">
                            {calcP ? (
                              <span className={`font-medium ${profitColor}`}>
                                {margin.toFixed(1)}%
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono-num text-right">
                            <span className={p.stock === 0 ? "text-red-400" : p.stock < 20 ? "text-yellow-400" : "text-green-400"}>
                              {p.stock === 0 ? "Нет" : p.stock}
                            </span>
                          </td>
                          <td className="px-4 py-3"><span className="text-[11px] text-muted-foreground">Синхронизируйте для рекомендаций</span></td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => openCalcDialog(p.name)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all ml-auto"
                            >
                              <Icon name="BarChart2" size={11} />
                              Детали
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Empty state after sync */}
                    {dbLoaded && dbProducts.length === 0 && d.products.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Нажмите «Синхронизировать» чтобы загрузить товары
                        </td>
                      </tr>
                    )}
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
              {/* ── Правила ценообразования ── */}
              <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(220,14%,9%)" }}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Правила ценообразования</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Применяются автоматически при синхронизации</p>
                  </div>
                  {rulesLoading && <Icon name="Loader2" size={14} className="animate-spin text-muted-foreground" />}
                </div>

                {/* Список правил */}
                <div className="divide-y divide-border">
                  {rules.length === 0 && !rulesLoading && (
                    <div className="px-5 py-6 text-center text-sm text-muted-foreground">
                      Правил пока нет. Добавьте первое ниже.
                    </div>
                  )}
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium text-foreground">{rule.label || RULE_TYPE_META[rule.type]?.label || rule.type}</p>
                          <span className="text-[10px] font-mono-num px-1.5 py-0.5 rounded border border-border text-muted-foreground" style={{ background: "hsl(220,16%,6%)" }}>
                            {rule.value}{rule.type.includes("margin") || rule.type === "max_discount" ? "%" : "%"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{rule.description || RULE_TYPE_META[rule.type]?.description}</p>
                      </div>
                      {/* Редактирование value */}
                      <input
                        type="number"
                        min={0.1}
                        max={100}
                        step={0.5}
                        defaultValue={rule.value}
                        onBlur={async (e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val !== rule.value) {
                            const data = await apiUpdateRule(rule.id, { value: val });
                            if (data?.ok) setRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: val } : r));
                          }
                        }}
                        className="w-16 rounded border border-border px-2 py-1 text-xs font-mono-num text-foreground text-right outline-none focus:border-primary/50 transition-colors"
                        style={{ background: "hsl(220,16%,6%)" }}
                      />
                      {/* Toggle включить/выключить */}
                      <button
                        onClick={async () => {
                          const data = await apiUpdateRule(rule.id, { enabled: !rule.enabled });
                          if (data?.ok) setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
                        }}
                        className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${rule.enabled ? "bg-primary" : "bg-secondary"}`}
                        title={rule.enabled ? "Выключить" : "Включить"}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${rule.enabled ? "left-4" : "left-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Добавить новое правило */}
                <div className="px-5 py-4 border-t border-border" style={{ background: "hsl(220,16%,6%)" }}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Добавить правило</p>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-xs text-muted-foreground block mb-1">Тип</label>
                      <select
                        value={newRuleType}
                        onChange={(e) => {
                          setNewRuleType(e.target.value);
                          setNewRuleValue(String(RULE_TYPE_META[e.target.value]?.default ?? 10));
                        }}
                        disabled={Object.keys(RULE_TYPE_META).every(t => rules.some(r => r.type === t))}
                        className="w-full rounded border border-border px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 appearance-none cursor-pointer"
                        style={{ background: "hsl(220,14%,9%)" }}
                      >
                        {Object.entries(RULE_TYPE_META).map(([key, meta]) => (
                          <option key={key} value={key} disabled={rules.some(r => r.type === key)}>
                            {meta.label}{rules.some(r => r.type === key) ? " (уже добавлено)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-muted-foreground block mb-1">{RULE_TYPE_META[newRuleType]?.value_label ?? "Значение"}</label>
                      <input
                        type="number"
                        min={0.1}
                        max={100}
                        step={0.5}
                        value={newRuleValue}
                        onChange={(e) => setNewRuleValue(e.target.value)}
                        className="w-full rounded border border-border px-3 py-2 text-sm font-mono-num text-foreground outline-none focus:border-primary/50 transition-colors text-right"
                        style={{ background: "hsl(220,14%,9%)" }}
                      />
                    </div>
                    <button
                      disabled={rulesSaving || rules.some(r => r.type === newRuleType)}
                      onClick={async () => {
                        const val = parseFloat(newRuleValue);
                        if (isNaN(val) || val <= 0) return;
                        setRulesSaving(true);
                        const data = await apiCreateRule(newRuleType, val);
                        if (data?.rule) {
                          setRules(prev => [...prev, data.rule]);
                          const nextType = Object.keys(RULE_TYPE_META).find(t => !rules.some(r => r.type === t) && t !== newRuleType);
                          if (nextType) { setNewRuleType(nextType); setNewRuleValue(String(RULE_TYPE_META[nextType].default)); }
                        }
                        setRulesSaving(false);
                      }}
                      className="flex items-center gap-1.5 text-sm px-4 py-2 rounded text-white transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      style={{ background: "hsl(210,100%,56%)" }}
                    >
                      {rulesSaving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Plus" size={14} />}
                      Добавить
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {RULE_TYPE_META[newRuleType]?.description}
                  </p>
                </div>
              </div>

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