import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const PORT = 3000;

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: "/socket.io",
});

io.on("connection", (socket) => {
  socket.emit("connected", { status: "connected", time: new Date().toISOString() });

  socket.on("subscribe", (data) => {
    socket.emit("subscribed", { status: "success", data });
  });

  socket.on("ping", () => {
    socket.emit("pong", { time: Date.now() });
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Permissive CORS middleware
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-CSRFToken");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Mock in-memory state for OpenAlgo
let analyzeMode = false;
let currentUser = {
  username: "OpenAlgo Trader",
  email: "trader@openalgo.local",
  broker: "Sandbox (Paper Trading)",
  isLoggedIn: true,
  api_key: "oa_live_demo_98234821",
};

// Initial Mock Market Data
const symbolsData: Record<string, any> = {
  "NIFTY": { ltp: 24350.50, open: 24280.00, high: 24410.00, low: 24250.00, close: 24290.00, change: 60.50, change_percent: 0.25, volume: 15420000, exchange: "NSE" },
  "BANKNIFTY": { ltp: 51890.20, open: 51650.00, high: 52050.00, low: 51580.00, close: 51720.00, change: 170.20, change_percent: 0.33, volume: 8930000, exchange: "NSE" },
  "FINNIFTY": { ltp: 23410.80, open: 23320.00, high: 23480.00, low: 23300.00, close: 23340.00, change: 70.80, change_percent: 0.30, volume: 4200000, exchange: "NSE" },
  "SENSEX": { ltp: 80120.40, open: 79850.00, high: 80300.00, low: 79800.00, close: 79910.00, change: 210.40, change_percent: 0.26, volume: 9100000, exchange: "BSE" },
  "RELIANCE": { ltp: 2980.50, open: 2955.00, high: 2995.00, low: 2950.00, close: 2960.00, change: 20.50, change_percent: 0.69, volume: 3200000, exchange: "NSE" },
  "TCS": { ltp: 4210.00, open: 4190.00, high: 4235.00, low: 4180.00, close: 4195.00, change: 15.00, change_percent: 0.36, volume: 1400000, exchange: "NSE" },
  "HDFCBANK": { ltp: 1680.20, open: 1670.00, high: 1688.00, low: 1665.00, close: 1672.00, change: 8.20, change_percent: 0.49, volume: 6800000, exchange: "NSE" },
  "INFY": { ltp: 1890.40, open: 1875.00, high: 1905.00, low: 1870.00, close: 1880.00, change: 10.40, change_percent: 0.55, volume: 2900000, exchange: "NSE" },
  "BTCUSDT": { ltp: 94250.00, open: 92800.00, high: 95100.00, low: 92400.00, close: 93100.00, change: 1150.00, change_percent: 1.24, volume: 45000, exchange: "CRYPTO" },
  "ETHUSDT": { ltp: 3450.00, open: 3380.00, high: 3490.00, low: 3360.00, close: 3390.00, change: 60.00, change_percent: 1.77, volume: 180000, exchange: "CRYPTO" },
};

// Open Positions
let positions = [
  {
    symbol: "NIFTY26SEP24400CE",
    exchange: "NFO",
    product: "MIS",
    quantity: 150,
    average_price: 112.50,
    buy_price: 112.50,
    sell_price: 0,
    ltp: 138.20,
    pnl: 3855.00,
    pnlpercent: 22.84,
    pnl_percentage: 22.84,
    value: 20730.00,
    m2m: 3855.00,
    status: "OPEN",
    lot_size: 50,
    today_realized_pnl: 0,
  },
  {
    symbol: "BANKNIFTY26SEP51800PE",
    exchange: "NFO",
    product: "NRML",
    quantity: 60,
    average_price: 245.00,
    buy_price: 245.00,
    sell_price: 0,
    ltp: 218.40,
    pnl: -1596.00,
    pnlpercent: -10.86,
    pnl_percentage: -10.86,
    value: 13104.00,
    m2m: -1596.00,
    status: "OPEN",
    lot_size: 15,
    today_realized_pnl: 0,
  },
  {
    symbol: "RELIANCE",
    exchange: "NSE",
    product: "CNC",
    quantity: 50,
    average_price: 2940.00,
    buy_price: 2940.00,
    sell_price: 0,
    ltp: 2980.50,
    pnl: 2025.00,
    pnlpercent: 1.38,
    pnl_percentage: 1.38,
    value: 149025.00,
    m2m: 2025.00,
    status: "OPEN",
    lot_size: 1,
    today_realized_pnl: 0,
  },
];

// Holdings
let holdings = [
  { symbol: "RELIANCE", exchange: "NSE", quantity: 100, product: "CNC", average_price: 2850.00, ltp: 2980.50, pnl: 13050.00, pnlpercent: 4.58 },
  { symbol: "TCS", exchange: "NSE", quantity: 50, product: "CNC", average_price: 3950.00, ltp: 4210.00, pnl: 13000.00, pnlpercent: 6.58 },
  { symbol: "HDFCBANK", exchange: "NSE", quantity: 150, product: "CNC", average_price: 1610.00, ltp: 1680.20, pnl: 10530.00, pnlpercent: 4.36 },
  { symbol: "INFY", exchange: "NSE", quantity: 80, product: "CNC", average_price: 1780.00, ltp: 1890.40, pnl: 8832.00, pnlpercent: 6.20 },
];

// Order book
let orders = [
  {
    orderid: "OA-ORD-101",
    order_id: "OA-ORD-101",
    symbol: "NIFTY26SEP24400CE",
    exchange: "NFO",
    action: "BUY",
    order_type: "LIMIT",
    pricetype: "LIMIT",
    product: "MIS",
    quantity: 150,
    price: 112.50,
    trigger_price: 0,
    order_status: "complete",
    status: "COMPLETE",
    placed_at: "2026-09-23 09:20:15",
    timestamp: "2026-09-23 09:20:15",
    filled_qty: 150,
    avg_price: 112.50,
  },
  {
    orderid: "OA-ORD-102",
    order_id: "OA-ORD-102",
    symbol: "BANKNIFTY26SEP51800PE",
    exchange: "NFO",
    action: "BUY",
    order_type: "MARKET",
    pricetype: "MARKET",
    product: "NRML",
    quantity: 60,
    price: 245.00,
    trigger_price: 0,
    order_status: "complete",
    status: "COMPLETE",
    placed_at: "2026-09-23 09:35:42",
    timestamp: "2026-09-23 09:35:42",
    filled_qty: 60,
    avg_price: 245.00,
  },
  {
    orderid: "OA-ORD-103",
    order_id: "OA-ORD-103",
    symbol: "RELIANCE",
    exchange: "NSE",
    action: "BUY",
    order_type: "LIMIT",
    pricetype: "LIMIT",
    product: "CNC",
    quantity: 50,
    price: 2940.00,
    trigger_price: 0,
    order_status: "complete",
    status: "COMPLETE",
    placed_at: "2026-09-23 10:02:11",
    timestamp: "2026-09-23 10:02:11",
    filled_qty: 50,
    avg_price: 2940.00,
  },
];

// Trade book
let trades = [
  {
    trade_id: "OA-TRD-901",
    orderid: "OA-ORD-101",
    order_id: "OA-ORD-101",
    symbol: "NIFTY26SEP24400CE",
    exchange: "NFO",
    action: "BUY",
    quantity: 150,
    average_price: 112.50,
    price: 112.50,
    trade_value: 16875.00,
    product: "MIS",
    timestamp: "2026-09-23 09:20:15",
    trade_time: "2026-09-23 09:20:15",
  },
  {
    trade_id: "OA-TRD-902",
    orderid: "OA-ORD-102",
    order_id: "OA-ORD-102",
    symbol: "BANKNIFTY26SEP51800PE",
    exchange: "NFO",
    action: "BUY",
    quantity: 60,
    average_price: 245.00,
    price: 245.00,
    trade_value: 14700.00,
    product: "NRML",
    timestamp: "2026-09-23 09:35:42",
    trade_time: "2026-09-23 09:35:42",
  },
  {
    trade_id: "OA-TRD-903",
    orderid: "OA-ORD-103",
    order_id: "OA-ORD-103",
    symbol: "RELIANCE",
    exchange: "NSE",
    action: "BUY",
    quantity: 50,
    average_price: 2940.00,
    price: 2940.00,
    trade_value: 147000.00,
    product: "CNC",
    timestamp: "2026-09-23 10:02:11",
    trade_time: "2026-09-23 10:02:11",
  },
];

// Strategies & Flow
let hostedStrategies = [
  { id: "strat-1", name: "EMA Crossover 9/21", symbol: "NIFTY", status: "RUNNING", interval: "5m", pnl: 4250.00, winRate: "68%", tradesCount: 14, lastRun: "Just now" },
  { id: "strat-2", name: "BankNifty SuperTrend Scalper", symbol: "BANKNIFTY", status: "RUNNING", interval: "3m", pnl: 6890.00, winRate: "72%", tradesCount: 22, lastRun: "1m ago" },
  { id: "strat-3", name: "Options Delta Neutral Strangle", symbol: "NIFTY", status: "IDLE", interval: "15m", pnl: 1850.00, winRate: "60%", tradesCount: 8, lastRun: "10m ago" },
];

// 36 Supported Brokers
const supportedBrokers = [
  { id: "sandbox", name: "Paper Trading (Sandbox)", display_name: "Paper Trading (Sandbox)", status: "connected", broker_type: "IN_stock" },
  { id: "angelone", name: "AngelOne", display_name: "Angel One (SmartAPI)", status: "active", broker_type: "IN_stock" },
  { id: "zerodha", name: "Zerodha", display_name: "Zerodha Kite Connect", status: "active", broker_type: "IN_stock" },
  { id: "dhan", name: "Dhan", display_name: "Dhan (Live + Sandbox)", status: "active", broker_type: "IN_stock" },
  { id: "fyers", name: "Fyers", display_name: "Fyers API v3", status: "active", broker_type: "IN_stock" },
  { id: "5paisa", name: "5paisa", display_name: "5paisa Capital", status: "active", broker_type: "IN_stock" },
  { id: "kotakneo", name: "Kotak Neo", display_name: "Kotak Neo API", status: "active", broker_type: "IN_stock" },
  { id: "shoonya", name: "Shoonya", display_name: "Shoonya (Finvasia)", status: "active", broker_type: "IN_stock" },
  { id: "upstox", name: "Upstox", display_name: "Upstox Pro v2", status: "active", broker_type: "IN_stock" },
  { id: "delta", name: "Delta Exchange", display_name: "Delta Exchange (Crypto)", status: "active", broker_type: "crypto" },
  { id: "groww", name: "Groww", display_name: "Groww Trade API", status: "active", broker_type: "IN_stock" },
  { id: "motilal", name: "Motilal Oswal", display_name: "Motilal Oswal", status: "active", broker_type: "IN_stock" },
  { id: "hdfcsky", name: "HDFC Sky", display_name: "HDFC Sky", status: "active", broker_type: "IN_stock" },
  { id: "paytm", name: "Paytm Money", display_name: "Paytm Money", status: "active", broker_type: "IN_stock" },
  { id: "aliceblue", name: "AliceBlue", display_name: "AliceBlue ANT", status: "active", broker_type: "IN_stock" },
  { id: "flattrade", name: "Flattrade", display_name: "Flattrade Wall", status: "active", broker_type: "IN_stock" },
];

/* -------------------------------------------------------------
   AUTH & SYSTEM APIS
------------------------------------------------------------- */

app.get("/auth/session-status", (req, res) => {
  res.json({
    status: "success",
    authenticated: true,
    logged_in: true,
    user: currentUser.username,
    broker: currentUser.broker,
    api_key: currentUser.api_key,
    active_sessions: 1,
  });
});

app.get("/auth/session", (req, res) => {
  res.json({
    status: "success",
    authenticated: true,
    user: currentUser.username,
    broker: currentUser.broker,
    api_key: currentUser.api_key,
  });
});

app.get("/auth/dashboard-data", (req, res) => {
  const totalPnL = positions.reduce((acc, p) => acc + (p.pnl || 0), 0);
  res.json({
    status: "success",
    data: {
      available_cash: 1000000.00 + totalPnL,
      total_margin: 1000000.00,
      used_margin: 182450.00,
      available_margin: 817550.00 + totalPnL,
      payin: 0,
      payout: 0,
      collateral: 0,
      m2m: totalPnL,
      realized_pnl: 2850.00,
      unrealized_pnl: totalPnL,
      positions_count: positions.length,
      holdings_count: holdings.length,
      orders_count: orders.length,
      broker: currentUser.broker,
      mode: analyzeMode ? "analyzer" : "live",
    },
  });
});

app.get("/auth/app-info", (req, res) => {
  res.json({
    status: "success",
    version: "2.5.1",
    app_name: "OpenAlgo",
    broker: currentUser.broker,
    python_engine: "ready",
  });
});

app.get("/auth/check-setup", (req, res) => {
  res.json({
    status: "success",
    needs_setup: false,
    initialized: true,
  });
});

app.get("/api/master-contract/status", (req, res) => {
  res.json({
    status: "success",
    data: {
      loaded: true,
      total_symbols: 8520,
      updated_at: new Date().toISOString(),
      exchanges: ["NSE", "NFO", "BSE", "MCX", "CDS", "CRYPTO"],
    },
  });
});

app.get("/auth/csrf-token", (req, res) => {
  res.json({
    csrf_token: "oa_csrf_token_valid_2026",
  });
});

app.get("/auth/brokers", (req, res) => {
  res.json({
    brokers: supportedBrokers,
  });
});

app.post("/auth/login", (req, res) => {
  res.json({
    status: "success",
    message: "Login successful",
    user: currentUser.username,
    broker: currentUser.broker,
    api_key: currentUser.api_key,
  });
});

app.post("/auth/logout", (req, res) => {
  res.json({
    status: "success",
    message: "Logged out successfully",
  });
});

app.get("/auth/analyzer-mode", (req, res) => {
  res.json({
    status: "success",
    data: {
      analyze_mode: analyzeMode,
    },
  });
});

app.post("/auth/analyzer-toggle", (req, res) => {
  analyzeMode = !analyzeMode;
  io.emit("analyzer_update", { analyze_mode: analyzeMode, timestamp: Date.now() });
  res.json({
    status: "success",
    data: {
      analyze_mode: analyzeMode,
      message: analyzeMode ? "Switched to Analyzer Mode" : "Switched to Live Mode",
    },
  });
});

app.get("/api/broker/capabilities", (req, res) => {
  res.json({
    status: "success",
    data: {
      broker_name: currentUser.broker,
      broker_type: "IN_stock",
      supported_exchanges: ["NSE", "NFO", "BSE", "MCX", "CDS", "CRYPTO"],
      leverage_config: true,
    },
  });
});

/* -------------------------------------------------------------
   CORE TRADING REST APIS (/api/v1/...)
------------------------------------------------------------- */

app.get("/api/v1/ping", (req, res) => {
  res.json({
    status: "success",
    message: "pong",
    broker: currentUser.broker,
    mode: analyzeMode ? "analyzer" : "live",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/v1/profile", (req, res) => {
  res.json({
    status: "success",
    data: {
      client_id: "OA-TRADER-001",
      name: currentUser.username,
      email: currentUser.email,
      broker: currentUser.broker,
      account_type: "Equity + F&O + Crypto Derivatives",
      created_at: "2026-01-01",
      api_key: currentUser.api_key,
    },
  });
});

const handleFunds = (req: Request, res: Response) => {
  const totalPnL = positions.reduce((acc, p) => acc + (p.pnl || 0), 0);
  res.json({
    status: "success",
    data: {
      availablecash: 1000000.00 + totalPnL,
      available_cash: 1000000.00 + totalPnL,
      collateral: 0,
      m2munrealized: totalPnL,
      m2mrealized: 2850.00,
      utiliseddebits: 182450.00,
      total_margin: 1000000.00,
      used_margin: 182450.00,
      available_margin: 817550.00 + totalPnL,
    },
  });
};
app.get("/api/v1/funds", handleFunds);
app.post("/api/v1/funds", handleFunds);

const handlePositions = (req: Request, res: Response) => {
  res.json({
    status: "success",
    data: positions,
  });
};
app.get("/api/v1/positions", handlePositions);
app.post("/api/v1/positions", handlePositions);
app.get("/api/v1/positionbook", handlePositions);
app.post("/api/v1/positionbook", handlePositions);

const handleHoldings = (req: Request, res: Response) => {
  const totalInv = holdings.reduce((acc, h) => acc + (h.average_price * h.quantity), 0);
  const totalVal = holdings.reduce((acc, h) => acc + (h.ltp * h.quantity), 0);
  const totalPnl = totalVal - totalInv;
  res.json({
    status: "success",
    data: {
      holdings: holdings,
      statistics: {
        totalholdingvalue: totalVal,
        totalinvvalue: totalInv,
        totalprofitandloss: totalPnl,
        totalpnlpercentage: totalInv > 0 ? (totalPnl / totalInv) * 100 : 0,
      },
    },
  });
};
app.get("/api/v1/holdings", handleHoldings);
app.post("/api/v1/holdings", handleHoldings);

const handleOrders = (req: Request, res: Response) => {
  res.json({
    status: "success",
    data: {
      orders: orders,
      statistics: {
        total_buy_orders: orders.filter((o) => o.action === "BUY").length,
        total_sell_orders: orders.filter((o) => o.action === "SELL").length,
        total_completed_orders: orders.filter((o) => o.order_status === "complete" || o.status === "COMPLETE").length,
        total_open_orders: orders.filter((o) => o.order_status === "open").length,
        total_rejected_orders: orders.filter((o) => o.order_status === "rejected").length,
      },
    },
  });
};
app.get("/api/v1/orders", handleOrders);
app.post("/api/v1/orderbook", handleOrders);
app.get("/api/v1/orderbook", handleOrders);

const handleTrades = (req: Request, res: Response) => {
  res.json({
    status: "success",
    data: trades,
  });
};
app.get("/api/v1/trades", handleTrades);
app.post("/api/v1/trades", handleTrades);
app.get("/api/v1/tradebook", handleTrades);
app.post("/api/v1/tradebook", handleTrades);

// Place Order
const handlePlaceOrder = (req: Request, res: Response) => {
  const body = req.body || {};
  const symbol = body.symbol || "NIFTY26SEP24400CE";
  const qty = parseInt(body.quantity, 10) || 50;
  const action = (body.action || "BUY").toUpperCase();
  const price = parseFloat(body.price) || (symbolsData[symbol]?.ltp || 120.00);
  const exchange = body.exchange || "NFO";
  const product = body.product || "MIS";
  const pricetype = body.pricetype || body.order_type || "LIMIT";
  const orderid = `OA-ORD-${Date.now().toString().slice(-4)}`;
  const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);

  const newOrder = {
    orderid,
    order_id: orderid,
    symbol,
    exchange,
    action,
    order_type: pricetype,
    pricetype,
    product,
    quantity: qty,
    price,
    trigger_price: parseFloat(body.trigger_price) || 0,
    order_status: "complete",
    status: "COMPLETE",
    placed_at: nowStr,
    timestamp: nowStr,
    filled_qty: qty,
    avg_price: price,
  };
  orders.unshift(newOrder);

  // Add trade execution
  const newTrade = {
    trade_id: `OA-TRD-${Date.now().toString().slice(-4)}`,
    orderid,
    order_id: orderid,
    symbol,
    exchange,
    action,
    quantity: qty,
    average_price: price,
    price,
    trade_value: qty * price,
    product,
    timestamp: nowStr,
    trade_time: nowStr,
  };
  trades.unshift(newTrade);

  // Update positions
  const existingPos = positions.find((p) => p.symbol === symbol);
  if (existingPos) {
    if (action === "BUY") {
      existingPos.quantity += qty;
    } else {
      existingPos.quantity -= qty;
    }
    existingPos.value = Math.abs(existingPos.quantity * price);
  } else {
    positions.unshift({
      symbol,
      exchange,
      product,
      quantity: action === "BUY" ? qty : -qty,
      average_price: price,
      buy_price: price,
      sell_price: 0,
      ltp: price,
      pnl: 0,
      pnlpercent: 0,
      pnl_percentage: 0,
      value: qty * price,
      m2m: 0,
      status: "OPEN",
      lot_size: 50,
      today_realized_pnl: 0,
    });
  }

  // Broadcast WebSocket update
  io.emit("order_event", newOrder);
  io.emit("trade_event", newTrade);
  io.emit("positions_update", positions);

  res.json({
    status: "success",
    message: "Order placed successfully",
    data: { orderid },
  });
};
app.post("/api/v1/orders", handlePlaceOrder);
app.post("/api/v1/placeorder", handlePlaceOrder);

// Modify Order
app.post(["/modify_order", "/api/v1/modify_order"], (req, res) => {
  const { orderid, quantity, price } = req.body || {};
  const order = orders.find((o) => o.orderid === orderid || o.order_id === orderid);
  if (order) {
    if (quantity) order.quantity = quantity;
    if (price) order.price = price;
  }
  res.json({ status: "success", data: { orderid } });
});

// Cancel Order
app.post(["/cancel_order", "/api/v1/cancel_order"], (req, res) => {
  const { orderid } = req.body || {};
  const order = orders.find((o) => o.orderid === orderid || o.order_id === orderid);
  if (order) {
    order.order_status = "cancelled";
    order.status = "CANCELLED";
  }
  res.json({ status: "success", data: { orderid } });
});

// Close Position
app.post(["/close_position", "/api/v1/close_position"], (req, res) => {
  const { symbol } = req.body || {};
  const index = positions.findIndex((p) => p.symbol === symbol);
  if (index > -1) {
    positions.splice(index, 1);
  }
  io.emit("close_position_event", { symbol });
  res.json({ status: "success", message: `Position closed for ${symbol}` });
});

// Basket Orders
app.post("/api/v1/basketorder", (req, res) => {
  const { orders: basketItems = [] } = req.body || {};
  const results = basketItems.map((item: any) => ({
    symbol: item.symbol,
    status: "success",
    orderid: `OA-ORD-${Date.now().toString().slice(-4)}`,
  }));
  res.json({
    status: "success",
    results,
    mode: analyzeMode ? "analyze" : "live",
  });
});

// Quotes & Depth
const handleQuotes = (req: Request, res: Response) => {
  const sym = (req.query.symbol as string) || req.body?.symbol || "NIFTY";
  const data = symbolsData[sym] || {
    ltp: 24350.50,
    open: 24280.00,
    high: 24410.00,
    low: 24250.00,
    close: 24290.00,
    prev_close: 24290.00,
    bid: 24350.00,
    ask: 24351.00,
    oi: 4500000,
    change: 60.50,
    change_percent: 0.25,
    volume: 15420000,
    exchange: "NSE",
  };
  res.json({
    status: "success",
    data,
  });
};
app.get("/api/v1/quotes", handleQuotes);
app.post("/api/v1/quotes", handleQuotes);

// MultiQuotes
app.post("/api/v1/multiquotes", (req, res) => {
  const symbols = req.body?.symbols || [];
  const results = symbols.map((s: any) => {
    const sym = s.symbol || "NIFTY";
    const quote = symbolsData[sym] || {
      ltp: 24350.50,
      open: 24280.00,
      high: 24410.00,
      low: 24250.00,
      close: 24290.00,
      prev_close: 24290.00,
      bid: 24350.00,
      ask: 24351.00,
      oi: 4500000,
      volume: 15420000,
    };
    return {
      symbol: sym,
      exchange: s.exchange || "NSE",
      data: quote,
    };
  });
  res.json({
    status: "success",
    results,
  });
});

// Depth
const handleDepth = (req: Request, res: Response) => {
  const sym = (req.query.symbol as string) || req.body?.symbol || "NIFTY";
  const ltp = symbolsData[sym]?.ltp || 24350.50;
  res.json({
    status: "success",
    data: {
      asks: [
        { price: ltp + 0.5, quantity: 450 },
        { price: ltp + 1.0, quantity: 700 },
        { price: ltp + 1.5, quantity: 1200 },
        { price: ltp + 2.0, quantity: 1800 },
        { price: ltp + 2.5, quantity: 3000 },
      ],
      bids: [
        { price: ltp - 0.5, quantity: 500 },
        { price: ltp - 1.0, quantity: 850 },
        { price: ltp - 1.5, quantity: 1400 },
        { price: ltp - 2.0, quantity: 2100 },
        { price: ltp - 2.5, quantity: 3500 },
      ],
      high: ltp + 60,
      low: ltp - 100,
      ltp,
      ltq: 50,
      oi: 4500000,
      open: ltp - 30,
      prev_close: ltp - 40,
      totalbuyqty: 85000,
      totalsellqty: 62000,
      volume: 15420000,
    },
  });
};
app.get("/api/v1/depth", handleDepth);
app.post("/api/v1/depth", handleDepth);

// Option Chain Generator
app.get("/api/v1/option-chain", (req, res) => {
  const underlying = (req.query.symbol as string) || "NIFTY";
  const spotPrice = underlying === "BANKNIFTY" ? 51890 : 24350;
  const strikeStep = underlying === "BANKNIFTY" ? 100 : 50;
  const baseStrike = Math.round(spotPrice / strikeStep) * strikeStep;

  const chain = [];
  for (let i = -10; i <= 10; i++) {
    const strike = baseStrike + i * strikeStep;
    const isITMCALL = strike < spotPrice;
    const isITMPUT = strike > spotPrice;
    const dist = Math.abs(strike - spotPrice);

    const callLtp = Math.max(5, (isITMCALL ? spotPrice - strike : 0) + Math.max(10, 180 - dist * 0.45));
    const putLtp = Math.max(5, (isITMPUT ? strike - spotPrice : 0) + Math.max(10, 175 - dist * 0.45));

    chain.push({
      strike,
      ce: {
        symbol: `${underlying}26SEP${strike}CE`,
        ltp: parseFloat(callLtp.toFixed(2)),
        change: parseFloat(((callLtp - 100) * 0.1).toFixed(2)),
        oi: Math.round(50000 + Math.random() * 80000),
        oi_change: Math.round(-5000 + Math.random() * 12000),
        volume: Math.round(120000 + Math.random() * 250000),
        iv: parseFloat((12.5 + Math.random() * 3).toFixed(2)),
        delta: parseFloat(Math.min(0.99, Math.max(0.01, 0.5 - (strike - spotPrice) / 600)).toFixed(2)),
        gamma: 0.0021,
        theta: -8.45,
        vega: 14.20,
      },
      pe: {
        symbol: `${underlying}26SEP${strike}PE`,
        ltp: parseFloat(putLtp.toFixed(2)),
        change: parseFloat(((putLtp - 90) * 0.1).toFixed(2)),
        oi: Math.round(45000 + Math.random() * 75000),
        oi_change: Math.round(-4000 + Math.random() * 10000),
        volume: Math.round(110000 + Math.random() * 220000),
        iv: parseFloat((13.1 + Math.random() * 3).toFixed(2)),
        delta: parseFloat(Math.max(-0.99, Math.min(-0.01, -0.5 - (strike - spotPrice) / 600)).toFixed(2)),
        gamma: 0.0021,
        theta: -8.15,
        vega: 13.90,
      },
    });
  }

  res.json({
    status: "success",
    data: {
      underlying,
      spot_price: spotPrice,
      expiry: "2026-09-26",
      expiries: ["2026-09-26", "2026-10-03", "2026-10-31"],
      chain,
    },
  });
});

// Strategies
app.get("/api/v1/strategies", (req, res) => {
  res.json({
    status: "success",
    data: hostedStrategies,
  });
});

app.post("/api/v1/strategies", (req, res) => {
  const newStrat = {
    id: `strat-${Date.now()}`,
    name: req.body.name || "Custom Python Strategy",
    symbol: req.body.symbol || "NIFTY",
    status: "RUNNING",
    interval: req.body.interval || "5m",
    pnl: 0,
    winRate: "0%",
    tradesCount: 0,
    lastRun: "Just now",
  };
  hostedStrategies.push(newStrat);
  res.json({ status: "success", data: newStrat });
});

// Historical Candles for TradingView / OpenAlgo charts
app.get("/api/v1/history", (req, res) => {
  const symbol = (req.query.symbol as string) || "NIFTY";
  const basePrice = symbolsData[symbol]?.ltp || 24350;

  const candles = [];
  const now = Math.floor(Date.now() / 1000);
  let curPrice = basePrice * 0.98;

  for (let i = 200; i >= 0; i--) {
    const time = now - i * 300;
    const delta = (Math.random() - 0.48) * (basePrice * 0.004);
    const open = curPrice;
    const close = curPrice + delta;
    const high = Math.max(open, close) + Math.random() * (basePrice * 0.002);
    const low = Math.min(open, close) - Math.random() * (basePrice * 0.002);
    const volume = Math.round(10000 + Math.random() * 50000);
    curPrice = close;

    candles.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });
  }

  res.json({
    status: "success",
    data: candles,
  });
});

// MaxPain & Greeks & Analytics
app.get("/api/v1/maxpain", (req, res) => {
  res.json({
    status: "success",
    data: {
      symbol: "NIFTY",
      max_pain_strike: 24350,
      total_ce_oi: 2450000,
      total_pe_oi: 2680000,
      pcr: 1.09,
    },
  });
});

app.get("/api/v1/gex", (req, res) => {
  res.json({
    status: "success",
    data: {
      symbol: "NIFTY",
      net_gamma: 14500000,
      zero_gamma_level: 24280,
      call_wall: 24500,
      put_wall: 24200,
    },
  });
});

// AI Agent Assistant endpoint
app.post("/api/v1/agent/chat", async (req, res) => {
  res.json({
    status: "success",
    data: {
      response: `[OpenAlgo Agent] Analysis for NIFTY 50:
- Current Trend: Bullish consolidation around 24,350.
- Support: 24,250 (Put Wall) | Resistance: 24,500 (Call Wall).
- Gamma Exposure (GEX): Positive gamma regime, favoring mean reversion and option selling strategies.
- Recommended Action: Bull Put Spread (Sell 24,300 PE / Buy 24,150 PE) or 9/21 EMA Trend Following.`,
      suggested_orders: [
        { symbol: "NIFTY26SEP24300PE", action: "SELL", quantity: 50, price: 65.00 },
        { symbol: "NIFTY26SEP24150PE", action: "BUY", quantity: 50, price: 28.00 },
      ],
    },
  });
});

// Catch-all API responder for unhandled OpenAlgo routes
app.all("/api/*", (req, res, next) => {
  if (res.headersSent) return;
  res.json({
    status: "success",
    data: [],
    message: "OpenAlgo Mock API Handler",
  });
});

/* -------------------------------------------------------------
   FRONTEND VITE / STATIC SERVING
------------------------------------------------------------- */

async function startServer() {
  const frontendDir = path.resolve(__dirname, "openalgo/frontend");

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      root: frontendDir,
      configFile: path.resolve(frontendDir, "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(frontendDir, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`OpenAlgo Platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
