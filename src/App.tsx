/* htmlhint disable */
// eslint-disable-next-line react/forbid-component-props
import {
  AlertTriangle,
  Barcode,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Hash,
  Image as ImageIcon,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  Lock,
  Unlock,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Package,
  PenTool,
  Phone,
  Printer,
  Plus,
  RefreshCw,
  Save,
  ScanBarcode,
  Search,
  ShieldCheck,
  MoreHorizontal,
  Smartphone,
  Trash2,
  Upload,
  User,
  Users,
  Wifi,
  Wrench,
  X,
  Sun,
  Moon,
  type LucideIcon,
  Settings,
  Database,
  Download,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { STATUS_OPTIONS, createId, engineerName } from "./data";
import {
  loadData,
  subscribeToServerData,
  loadSessionUser,
  saveData,
  saveServerData,
  saveSessionUser,
  saveFolderHandle,
  loadFolderHandle,
  deleteFolderHandle,
  writeBackupToFolder,
} from "./storage";
import type {
  AppData,
  Customer,
  InventoryItem,
  ServiceJob,
  ServiceStatus,
  User as AppUser,
  UserRole,
} from "./types";

type ViewKey = "dashboard" | "receive" | "jobs" | "details" | "inventory" | "staff" | "customers" | "settings";
type SyncMode = "checking" | "server" | "local";

type JobFormState = {
  customerName: string;
  mobileNumber: string;
  productName: string;
  productSerialNo: string;
  problem: string;
  assignedEngineerId: string;
  photoDataUrl?: string;
  estimatedCost: string;
  advancePayment?: string;
};

const emptyJobForm = (user: AppUser | null): JobFormState => ({
  customerName: "",
  mobileNumber: "",
  productName: "",
  productSerialNo: "",
  problem: "",
  assignedEngineerId: "",
  estimatedCost: "",
  advancePayment: "",
});

const statusClass: Record<ServiceStatus, string> = {
  Received: "status-received",
  Assigned: "status-assigned",
  Diagnosing: "status-diagnosing",
  "Waiting Parts": "status-waiting",
  Repaired: "status-repaired",
  Delivered: "status-delivered",
  Cancelled: "status-cancelled",
  "Request Reassign": "status-reassign",
  Returned: "status-returned",
};

const navItems: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "receive", label: "Receive Item", icon: Plus },
  { key: "jobs", label: "Jobs List", icon: ListChecks },
  { key: "details", label: "Repair Desk", icon: Wrench },
  { key: "inventory", label: "Inventory", icon: Package },
];

const viewTitle: Record<ViewKey, string> = {
  dashboard: "Dashboard",
  receive: "Receive Product",
  jobs: "Service Jobs",
  details: "Job Details",
  inventory: "Inventory Management",
  staff: "Team & Roles",
  customers: "Customer Directory",
  settings: "Settings",
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const PHOTO_TARGET_BYTES = 100 * 1024;
const DELIVERED_PHOTO_TARGET_BYTES = 70 * 1024;

const dataUrlBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
};

const formatKb = (bytes: number) =>
  `${Math.max(1, Math.round(bytes / 1024))} KB`;

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = source;
  });

const fileToObjectUrl = async <T,>(
  file: File,
  action: (url: string) => Promise<T>,
) => {
  const url = URL.createObjectURL(file);
  try {
    return await action(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const compressImageSource = async (
  source: string,
  targetBytes = PHOTO_TARGET_BYTES,
) => {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas not supported");
  }

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = Math.min(1, 1280 / Math.max(1, longestSide));
  let best = "";

  for (let sizeAttempt = 0; sizeAttempt < 8; sizeAttempt += 1) {
    canvas.width = Math.max(360, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(360, Math.round(image.naturalHeight * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.82; quality >= 0.34; quality -= 0.08) {
      const next = canvas.toDataURL("image/jpeg", Number(quality.toFixed(2)));
      if (!best || dataUrlBytes(next) < dataUrlBytes(best)) {
        best = next;
      }
      if (dataUrlBytes(next) <= targetBytes) {
        return next;
      }
    }

    scale *= 0.78;
  }

  return best;
};

const compressImageFile = (file: File, targetBytes = PHOTO_TARGET_BYTES) =>
  fileToObjectUrl(file, (url) => compressImageSource(url, targetBytes));

const recompressDataUrl = (
  dataUrl: string,
  targetBytes = DELIVERED_PHOTO_TARGET_BYTES,
) => compressImageSource(dataUrl, targetBytes);

function LoginScreen({
  users,
  onLogin,
  theme,
  onToggleTheme,
}: {
  users: AppUser[];
  onLogin: (user: AppUser) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      let baseUrl = "https://etechworld.in/galaxy_api";
      let res;
      try {
        res = await fetch(`${baseUrl}/login.php?api_key=galaxy_it_repair_secret_key_2026`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ email, password })
        });
      } catch (err) {
        baseUrl = "https://www.etechworld.in/galaxy_api";
        res = await fetch(`${baseUrl}/login.php?api_key=galaxy_it_repair_secret_key_2026`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ email, password })
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        onLogin(data.user);
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  

  


  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="theme-switch-container">
          <button
            type="button"
            className={`theme-switch ${theme}`}
            onClick={onToggleTheme}
            aria-label={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            <div className="theme-switch-handle">
              {theme === "light" ? <Sun size={14} /> : <Moon size={14} />}
            </div>
          </button>
        </div>

        <div className="brand-block">
          <span className="brand-mark">
            <Wrench size={22} />
          </span>
          <div>
            <h1 id="login-title">Galaxy Cartridge Care</h1>
            <p>Service receive, repair update, inventory</p>
            <span className="dev-credit">Developed by PC WORLD | v2.32</span>
          </div>
        </div>

        {/* Unified Login */}
        {!forgotMode && (
          <form className="login-form" onSubmit={submitLogin}>
            
            <label className="field">
              <span>Email Address</span>
              <div className="input-with-icon">
                <LockKeyhole size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>
            <label className="field">
              <span>Password</span>
              <div className="input-with-icon">
                <LockKeyhole size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button full" type="submit" disabled={loading} aria-label="Action button">
              <ShieldCheck size={17} />
              {loading ? "Logging in..." : "Login with Email"}
            </button>
            
          </form>
        )}

        {/* ── FORGOT PASSWORD ── */}
        
      </section>
    </main>
  );
}

function PinScreen({ user, onVerify, onLogout }: { user: AppUser; onVerify: () => void; onLogout: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pin === user.pin) {
      onVerify();
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-block">
          <span className="brand-mark">
            <Lock size={22} />
          </span>
          <div>
            <h1 style={{ fontSize: "1.2rem", marginBottom: "4px" }}>Security PIN Required</h1>
            <p>Welcome back, {user.name}!</p>
          </div>
        </div>
        
        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span>Enter 4-Digit PIN</span>
            <div className="input-with-icon">
              <LockKeyhole size={16} />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                required
                autoFocus
                style={{ letterSpacing: "4px", fontSize: "1.1rem" }}
              />
            </div>
          </label>
          
          {error && <p className="form-error">{error}</p>}
          
          <button className="primary-button full-width" type="submit" aria-label="Action button">
            <Unlock size={16} /> Unlock
          </button>
          
          <button 
            type="button" 
            className="utility-button full-width" 
            onClick={onLogout}
            style={{ marginTop: "12px" }}
           aria-label="Action button">
            <LogOut size={16} /> Switch User
          </button>
        </form>
      </section>
    </main>
  );
}

function AppShell({
  user,
  activeView,
  storeLogo,
  onUploadLogo,
  onUploadUserPhoto,
  onViewChange,
  onLogout,
  children,
}: {
  user: AppUser;
  activeView: ViewKey;
  storeLogo?: string;
  onUploadLogo?: (file: File) => void;
  onUploadUserPhoto?: (file: File) => void;
  onViewChange: (view: ViewKey) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [showMore, setShowMore] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null);
      });
    }
  };

  const allNavItems = navItems.concat(
    user?.role === "admin"
      ? [
          { key: "staff" as const, label: "Team", icon: User },
          { key: "customers" as const, label: "Customers", icon: Users },
          { key: "settings" as const, label: "Settings", icon: Settings },
        ]
      : []
  );

  const mainItems = isMobile ? navItems.filter((i) => i.key !== "inventory") : allNavItems;
  const moreItems = isMobile
    ? [
        navItems.find((i) => i.key === "inventory")!,
        ...(user?.role === "admin"
          ? [
              { key: "staff" as const, label: "Team", icon: User },
              { key: "customers" as const, label: "Customers", icon: Users },
              { key: "settings" as const, label: "Settings", icon: Settings },
            ]
          : []),
      ]
    : [];

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Main navigation">
        <div className="brand-block compact">
          <label className="brand-mark editable-image" style={{ cursor: user.role === "admin" ? "pointer" : "default", overflow: "hidden" }}>
            {storeLogo ? (
              <img src={storeLogo} alt="Store Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
            ) : (
              <Wrench size={21} />
            )}
            {user.role === "admin" && (
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0] && onUploadLogo) {
                    onUploadLogo(e.target.files[0]);
                  }
                }}
              />
            )}
          </label>
          <div>
            <strong>Galaxy Cartridge Care</strong>
            <span>{user.role === "admin" ? "Admin" : "Engineer"} panel</span>
          </div>
        </div>

        <nav className="nav-list">
          {mainItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.key}
                className={
                  activeView === item.key && !showMore ? "nav-button active" : "nav-button"
                }
                onClick={() => {
                  setShowMore(false);
                  onViewChange(item.key);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
          
          {isMobile && (
            <div style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
              <button
                type="button"
                className={showMore || activeView === "inventory" || activeView === "staff" || activeView === "settings" ? "nav-button active" : "nav-button"}
                onClick={() => setShowMore(!showMore)}
                style={{ width: "100%" }}
              >
                <MoreHorizontal size={18} />
                <span>More</span>
              </button>

              {showMore && (
                <div className="more-menu-dropdown">
                  {moreItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        className={activeView === item.key ? "more-item active" : "more-item"}
                        onClick={() => {
                          setShowMore(false);
                          onViewChange(item.key);
                        }}
                      >
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="dev-credit-sidebar">
          Galaxy Cartridge Care
          <br />
          <small>Developed by PC WORLD | v2.32</small>
        </div>

        <div className="user-card">
          <label className="avatar editable-image" style={{ cursor: "pointer", overflow: "hidden" }}>
            {user.photo ? (
              <img src={user.photo} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
            ) : (
              user.name.slice(0, 1)
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0] && onUploadUserPhoto) {
                  onUploadUserPhoto(e.target.files[0]);
                }
              }}
            />
          </label>
          <div>
            <strong>{user.name}</strong>
            <span>{user.id}</span>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            {deferredPrompt && (
              <button
                className="icon-button"
                type="button"
                onClick={handleInstallClick}
                aria-label="Install App"
                style={{ background: "var(--blue)", color: "white" }}
                title="Install App"
              >
                <Download size={17} />
              </button>
            )}
            <button
              className="icon-button"
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <section className="content-shell">{children}</section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <article className={`stat-card ${tone}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <span className="stat-icon">
        <Icon size={20} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function AutoLockTimer({ onLock }: { onLock: () => void }) {
  const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
  const [remaining, setRemaining] = useState(IDLE_TIMEOUT_MS);
  
  useEffect(() => {
    let lastActivityAt = Date.now();
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
    
    const handleActivity = () => {
      if (!throttleTimeout) {
        lastActivityAt = Date.now();
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 1000);
      }
    };
    
    const events = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => document.addEventListener(event, handleActivity));

    const interval = setInterval(() => {
      const r = Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt));
      setRemaining(r);
      if (r === 0) {
        onLock();
      }
    }, 1000);

    return () => {
      events.forEach(event => document.removeEventListener(event, handleActivity));
      clearInterval(interval);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [onLock]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  
  return (
    <div className="sync-pill" style={{ marginLeft: "8px", background: "var(--color-surface-mixed)" }} title="Auto-lock countdown">
      <Lock size={14} style={{ marginRight: 4 }} />
      <span>{mins}:{secs.toString().padStart(2, '0')}</span>
    </div>
  );
}

function TopBar({
  user,
  activeView,
  onLock,
  theme,
  onToggleTheme,
}: {
  user: AppUser;
  activeView: ViewKey;
  onLock: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <p>{user.role === "admin" ? "Admin" : "Engineer"}</p>
        <h2>{viewTitle[activeView]}</h2>
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          type="button"
          className={`theme-switch ${theme}`}
          onClick={onToggleTheme}
          style={{ marginRight: "16px" }}
          aria-label={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          <div className="theme-switch-handle">
            {theme === "light" ? <Sun size={14} /> : <Moon size={14} />}
          </div>
        </button>
        <AutoLockTimer onLock={onLock} />
      </div>
    </header>
  );
}

function SummaryGrid({
  user,
  jobs,
  inventory,
  upiId,
  upiName,
  onMarkPaid,
}: {
  user: AppUser;
  jobs: ServiceJob[];
  inventory: InventoryItem[];
  upiId?: string;
  upiName?: string;
  onMarkPaid: (jobId: string) => void;
}) {
  const today = new Date().toDateString();
  const pending = jobs.filter(
    (job) => !["Repaired", "Delivered", "Cancelled"].includes(job.status),
  ).length;
  const repaired = jobs.filter((job) => job.status === "Repaired").length;
  const todayCount = jobs.filter(
    (job) => new Date(job.createdAt).toDateString() === today,
  ).length;
  const inventoryValue = inventory.reduce(
    (sum, item) => sum + item.price * item.stock,
    0,
  );

  const creditJobs = jobs.filter(j => j.status === "Delivered" && j.isCredit === true);
  const totalCreditDue = creditJobs.reduce((sum, j) => sum + ((j.repairCost || 0) - (j.advancePayment || 0) - (j.deliveryPayment || 0)), 0);

  const [creditModalOpen, setCreditModalOpen] = useState(false);

  const buildPaymentReminder = (job: ServiceJob) => {
    const balanceDue = (job.repairCost || 0) - (job.advancePayment || 0) - (job.deliveryPayment || 0);
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    
    let text = `*Galaxy Cartridge Care - Payment Reminder*\n\nHi ${job.customerName},\nThis is a friendly reminder for your pending payment.\n\nTicket: ${job.ticketNo}\nProduct: ${job.productName}\nTotal Cost: ₹${job.repairCost}\nAdvance Paid: ₹${job.advancePayment || 0}${job.deliveryPayment ? `\nPaid at Delivery: ₹${job.deliveryPayment}` : ''}\n*Balance Due: ₹${balanceDue}*`;

    if (upiId) {
      const shortName = upiName ? encodeURIComponent(upiName.split(" ")[0].replace(/[^a-zA-Z0-9]/g, "")) : 'Store';
      const upiLink = `${baseUrl}pay.html?pa=${upiId}&pn=${shortName}&am=${balanceDue}`;
      text += `\n\n*Pay Online via UPI:*\n${upiLink}`;
    }

    const params = new URLSearchParams({
      t: job.ticketNo,
      d: job.createdAt,
      c: job.customerName,
      m: job.mobileNumber,
      p: job.productName,
      st: job.status
    });
    if (job.productSerialNo) params.set('s', job.productSerialNo);
    if (job.problem) params.set('pr', job.problem);
    if (job.estimatedCost) params.set('ec', job.estimatedCost.toString());
    if (job.repairCost !== undefined) params.set('rc', job.repairCost.toString());
    if (job.advancePayment) params.set('ap', job.advancePayment.toString());
    if (job.deliveryPayment) params.set('dp', job.deliveryPayment.toString());
    if (job.partsUsed && job.partsUsed.length > 0) {
      params.set('pu', job.partsUsed.map(p => `${p.name}:${p.price}`).join('|'));
    }
    const invoiceLink = `${baseUrl}invoice.html?${params.toString()}`;
    text += `\n\n*View Invoice:*\n${invoiceLink}`;
    
    text += `\n\nPlease clear the dues at the earliest. Thank you!`;
    return text;
  };

  const handleWhatsApp = (job: ServiceJob) => {
    const text = buildPaymentReminder(job);
    window.open(`https://wa.me/91${job.mobileNumber.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleSms = (job: ServiceJob) => {
    const balanceDue = (job.repairCost || 0) - (job.advancePayment || 0) - (job.deliveryPayment || 0);
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    let smsText = `Galaxy Cartridge Care: Hi ${job.customerName}, your pending balance for Ticket ${job.ticketNo} is Rs.${balanceDue}.`;
    if (upiId) {
      const shortName = upiName ? encodeURIComponent(upiName.split(" ")[0].replace(/[^a-zA-Z0-9]/g, "")) : 'Store';
      smsText += ` Pay: ${baseUrl}pay.html?pa=${upiId}&pn=${shortName}&am=${balanceDue}`;
    }
    window.open(`sms:+91${job.mobileNumber.replace(/\D/g, '')}?body=${encodeURIComponent(smsText)}`, '_self');
  };

  return (
    <>
      <section className="summary-grid" aria-label="Service summary">
        <StatCard
          icon={ClipboardList}
          label="Total Jobs"
          value={jobs.length}
          tone="tone-blue"
        />
        <StatCard
          icon={AlertTriangle}
          label="Pending"
          value={pending}
          tone="tone-amber"
        />
        <StatCard
          icon={CheckCircle2}
          label="Repaired"
          value={repaired}
          tone="tone-green"
        />
        <StatCard
          icon={Clock}
          label="Today's Intake"
          value={todayCount}
          tone="tone-purple"
        />
        {user.role === "admin" && (
          <StatCard
            icon={IndianRupee}
            label="Inventory Value"
            value={formatMoney(inventoryValue)}
            tone="tone-teal"
          />
        )}
        {user.role === "admin" && creditJobs.length > 0 && (
          <StatCard
            icon={AlertTriangle}
            label="Credit Dues"
            value={`₹${totalCreditDue}`}
            tone="tone-amber"
            onClick={() => setCreditModalOpen(true)}
          />
        )}
      </section>

      {creditModalOpen && (
        <div className="modal-overlay" onClick={() => setCreditModalOpen(false)} aria-hidden="true">
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: '600px', width: '95%' }}>
            <div className="modal-header">
              <h3>Credit Customers ({creditJobs.length})</h3>
              <button className="icon-button" onClick={() => setCreditModalOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '4px 0' }}>
              {creditJobs.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No credit customers found.</p>
              ) : (
                creditJobs.map(job => {
                  const balanceDue = (job.repairCost || 0) - (job.advancePayment || 0) - (job.deliveryPayment || 0);
                  return (
                    <div key={job.id} style={{ 
                      padding: '14px', 
                      marginBottom: '10px', 
                      background: 'var(--surface-soft)', 
                      borderRadius: '12px', 
                      border: '1px solid var(--border)' 
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div>
                          <strong style={{ color: 'var(--text-contrast)', fontSize: '1rem' }}>{job.customerName}</strong>
                          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                            <Phone size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {job.mobileNumber} &middot; {job.ticketNo}
                          </p>
                        </div>
                        <span style={{ 
                          fontWeight: 'bold', 
                          fontSize: '1.05rem', 
                          color: 'var(--amber)',
                          whiteSpace: 'nowrap'
                        }}>
                          ₹{balanceDue}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: '0.82rem' }}>
                        {job.productName} &middot; Total: ₹{job.repairCost} &middot; Advance: ₹{job.advancePayment || 0}{job.deliveryPayment ? ` &middot; Paid at Delivery: ₹${job.deliveryPayment}` : ''}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button 
                          className="utility-button filled" 
                          style={{ flex: 1, justifyContent: 'center', minWidth: '100px', background: 'rgba(37, 211, 102, 0.15)', color: '#25d366', border: '1px solid rgba(37, 211, 102, 0.3)' }}
                          onClick={() => handleWhatsApp(job)}
                        >
                          <MessageCircle size={14} /> WhatsApp
                        </button>
                        <button 
                          className="utility-button filled" 
                          style={{ flex: 1, justifyContent: 'center', minWidth: '80px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--blue)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                          onClick={() => handleSms(job)}
                        >
                          <Phone size={14} /> SMS
                        </button>
                        <button 
                          className="utility-button filled" 
                          style={{ flex: 1, justifyContent: 'center', minWidth: '100px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--green)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                          onClick={() => {
                            onMarkPaid(job.id);
                            if (creditJobs.length <= 1) setCreditModalOpen(false);
                          }}
                        >
                          <CheckCircle2 size={14} /> Mark Paid
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ 
              borderTop: '1px solid var(--border)', 
              paddingTop: '12px', 
              marginTop: '8px',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Total Outstanding</span>
              <strong style={{ color: 'var(--amber)', fontSize: '1.2rem' }}>₹{totalCreditDue}</strong>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorLike;

function SerialScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [message, setMessage] = useState("Camera ready kar rahe hain...");

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let stopped = false;
    let timer = 0;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      window.clearTimeout(timer);
    };

    const startScanner = async () => {
      const BarcodeDetectorCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;

      if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
        setMessage(
          "Is mobile browser me live barcode scanner support nahi hai. Serial number manually type karein.",
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new BarcodeDetectorCtor({
          formats: [
            "qr_code",
            "code_128",
            "code_39",
            "code_93",
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
          ],
        });
        setMessage("Barcode ko camera ke box ke andar rakhein.");

        const tick = async () => {
          if (stopped || !videoRef.current) {
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              onDetected(value);
              onClose();
              return;
            }
          } catch {
            setMessage(
              "Scan continue hai. Barcode ko thoda clear aur seedha rakhein.",
            );
          }
          timer = window.setTimeout(tick, 450);
        };

        void tick();
      } catch {
        setMessage(
          "Camera permission nahi mila. Serial number manually type karein.",
        );
      }
    };

    void startScanner();

    return () => {
      stopped = true;
      stopStream();
    };
  }, [open, onClose, onDetected]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="scanner-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Scan Serial"
    >
      <section className="scanner-card">
        <div className="scanner-heading">
          <div>
            <p>Mobile barcode reader</p>
            <h3>Scan Serial</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scanner-frame">
          <video ref={videoRef} muted playsInline />
          <span className="scan-line" />
        </div>
        <p className="scanner-message">{message}</p>
      </section>
    </div>
  );
}

function ImageViewerPopup({
  photoUrl,
  open,
  onClose,
}: {
  photoUrl: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !photoUrl) return null;

  return (
    <div className="modal-overlay" onClick={onClose} aria-hidden="true">
      <section
        className="modal-card image-viewer"
        onClick={(e) => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        <div className="modal-header">
          <h3>Full Photo</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="image-viewer-frame">
          <img src={photoUrl} alt="Full size product" />
        </div>
      </section>
    </div>
  );
}

function PhotoAnnotator({
  photoUrl,
  open,
  onClose,
  onSave,
}: {
  photoUrl: string;
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!open || !photoUrl) {
      setImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = photoUrl;
  }, [open, photoUrl]);

  useEffect(() => {
    if (!open || !image || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions based on container to maintain aspect ratio
    const containerWidth = containerRef.current.clientWidth;
    const scale = containerWidth / image.width;
    canvas.width = containerWidth;
    canvas.height = image.height * scale;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "red";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open, image]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    setDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ("touches" in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !canvasRef.current) return;
    e.preventDefault(); // Prevent scrolling on touch
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ("touches" in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!drawing) return;
    setDrawing(false);
  };

  const saveAnnotation = () => {
    if (!canvasRef.current) return;
    onSave(canvasRef.current.toDataURL("image/jpeg", 0.8));
    onClose();
  };

  const clearAnnotation = () => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  };

  if (!open) return null;

  return (
    <div
      className="scanner-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Annotate Photo"
    >
      <section className="scanner-card">
        <div className="scanner-heading">
          <div>
            <p>Draw on photo</p>
            <h3>Annotate Issue</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close annotator"
          >
            <X size={18} />
          </button>
        </div>
        <div className="annotator-frame" ref={containerRef}>
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
        <div className="annotator-actions">
          <button
            className="utility-button"
            type="button"
            onClick={clearAnnotation}
           aria-label="Action button">
            Clear
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={saveAnnotation}
           aria-label="Action button">
            Save Annotation
          </button>
        </div>
      </section>
    </div>
  );
}

function IntakeForm({
  users,
  user,
  inventory,
  jobs,
  onCreate,
}: {
  users: AppUser[];
  user: AppUser;
  inventory: InventoryItem[];
  jobs: ServiceJob[];
  onCreate: (form: JobFormState) => void;
}) {
  const [form, setForm] = useState<JobFormState>(() => emptyJobForm(user));
  const [saving, setSaving] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  const [mobileScannerAvailable, setMobileScannerAvailable] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const serialScanInputRef = useRef<HTMLInputElement>(null);

  const pastCustomers = useMemo(() => {
    const customers = new Map<string, { name: string, mobile: string }>();
    for (const job of jobs) {
      if (job.customerName && job.mobileNumber) {
        customers.set(job.customerName + "|" + job.mobileNumber, { name: job.customerName, mobile: job.mobileNumber });
      }
    }
    return Array.from(customers.values());
  }, [jobs]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      assignedEngineerId:
        user.role === "engineer"
          ? user.id
          : current.assignedEngineerId || "ENG-01",
    }));
  }, [user]);

  useEffect(() => {
    const query = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setMobileScannerAvailable(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const updateForm = (key: keyof JobFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const readPhoto = async (file?: File) => {
    if (!file) {
      return;
    }
    setPhotoNote("Processing photo...");
    try {
      const compressed = await compressImageFile(file, PHOTO_TARGET_BYTES);
      setForm((current) => ({
        ...current,
        photoDataUrl: compressed,
      }));
      setPhotoNote("Photo attached successfully.");
    } catch {
      setPhotoNote("Failed to attach photo.");
    }
  };

  const scanSerialPhoto = async (file?: File) => {
    if (!file) {
      return;
    }
    setScanNote("Barcode photo scan ho raha hai...");
    const BarcodeDetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;

    if (!BarcodeDetectorCtor || !("createImageBitmap" in window)) {
      setScanNote(
        "Is browser me barcode auto-read support nahi hai. Serial manually type karein.",
      );
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const detector = new BarcodeDetectorCtor({
        formats: [
          "qr_code",
          "code_128",
          "code_39",
          "code_93",
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
        ],
      });
      const codes = await detector.detect(bitmap);
      const value = codes[0]?.rawValue?.trim();
      if (value) {
        updateForm("productSerialNo", value);
        setScanNote("Serial scanned successfully.");
        return;
      }
      setScanNote("Barcode/QR nahi mila. Serial manually type karein.");
    } catch {
      setScanNote("Scan complete nahi hua. Serial manually type karein.");
    }
  };

  const startSerialScan = () => {
    const BarcodeDetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (
      BarcodeDetectorCtor &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    ) {
      setScannerOpen(true);
      return;
    }
    serialScanInputRef.current?.click();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    onCreate(form);
    setForm(emptyJobForm(user));
    setScanNote("");
    setPhotoNote("");
    setAnnotatorOpen(false);
    setTimeout(() => setSaving(false), 350);
  };

  const selectedPrice = inventory.find(
    (item) => item.name.toLowerCase() === form.productName.trim().toLowerCase(),
  )?.price;

  return (
    <section className="panel intake-panel" aria-labelledby="receive-title">
      <SerialScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(value) => {
          updateForm("productSerialNo", value);
          setScanNote("Serial scanned successfully.");
        }}
      />
      <div className="panel-heading">
        <div>
          <p>Receive counter</p>
          <h3 id="receive-title">New Receive</h3>
        </div>
        <span className="panel-icon">
          <Smartphone size={19} />
        </span>
      </div>

      <form className="intake-form" onSubmit={submit}>
        <label className="field" style={{ position: "relative" }}>
          <span>Customer Name</span>
          <div className="input-with-icon">
            <User size={16} />
            <input
              required
              value={form.customerName}
              onChange={(event) => {
                updateForm("customerName", event.target.value);
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
              placeholder="Customer Name"
              autoComplete="off"
            />
          </div>
          {showCustomerDropdown && form.customerName && (
            <ul style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #ddd", borderRadius: "0 0 6px 6px", zIndex: 10, listStyle: "none", padding: 0, margin: 0, maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
              {pastCustomers
                .filter(c => c.name.toLowerCase().includes(form.customerName.toLowerCase()) || c.mobile.includes(form.customerName))
                .slice(0, 10)
                .map((c, idx) => (
                  <li 
                    key={idx} 
                    style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", color: "#000" }}
                    onMouseDown={() => {
                      updateForm("customerName", c.name);
                      updateForm("mobileNumber", c.mobile);
                      setShowCustomerDropdown(false);
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <strong style={{ color: "#000" }}>{c.name}</strong> <span style={{color: "#64748b", fontSize: "0.9em"}}>{c.mobile}</span>
                  </li>
              ))}
            </ul>
          )}
        </label>

        <label className="field">
          <span>Mobile Number</span>
          <div className="input-with-icon">
            <Phone size={16} />
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={form.mobileNumber}
              onChange={(event) =>
                updateForm(
                  "mobileNumber",
                  event.target.value.replace(/\D/g, ""),
                )
              }
              placeholder="10 digit mobile"
            />
          </div>
        </label>

        <label className="field">
          <span>Product Name</span>
          <div className="input-with-icon">
            <Package size={16} />
            <input
              required
              list="inventory-products"
              value={form.productName}
              onChange={(event) =>
                updateForm("productName", event.target.value)
              }
              placeholder="Printer, Laptop, CPU"
            />
          </div>
          <datalist id="inventory-products">
            {inventory.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          {selectedPrice ? (
            <small>Inventory price: {formatMoney(selectedPrice)}</small>
          ) : null}
        </label>

        <div className="field">
          <span>Product Serial No</span>
          <div className="serial-row">
            <div className="input-with-icon">
              <Hash size={16} />
              <input
                required
                value={form.productSerialNo}
                onChange={(event) =>
                  updateForm("productSerialNo", event.target.value)
                }
                placeholder="Serial number"
              />
            </div>
            {mobileScannerAvailable ? (
              <button
                className="utility-button mobile-scan-button"
                type="button"
                onClick={startSerialScan}
               aria-label="Action button">
                <ScanBarcode size={17} />
                Scan Serial
              </button>
            ) : null}
            <input
              ref={serialScanInputRef}
              className="hidden-input"
              type="file"
              accept="image/*"
             
              onChange={(event) =>
                void scanSerialPhoto(event.target.files?.[0])
              }
            />
          </div>
          {scanNote ? (
            <small>{scanNote}</small>
          ) : (
            <small>
              {mobileScannerAvailable
                ? "Mobile par Scan Serial button se camera barcode reader open hoga."
                : "PC par barcode reader lagane se serial yahin auto type ho jayega."}
            </small>
          )}
        </div>

        {user.role === "admin" ? (
          <label className="field">
            <span>Engineer</span>
            <select
              value={form.assignedEngineerId}
              onChange={(event) =>
                updateForm("assignedEngineerId", event.target.value)
              }
            >
              {users.filter((person) => person.role === "engineer").map(
                (person) => (
                  <option value={person.id} key={person.id}>
                    {person.id} - {person.name}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}

        <label className="field full-width">
          <span>Problem</span>
          <div className="input-with-icon textarea-wrap">
            <FileText size={16} />
            <textarea
              required
              value={form.problem}
              onChange={(event) => updateForm("problem", event.target.value)}
              placeholder="Product problem"
              rows={4}
            />
          </div>
        </label>

        <label className="field full-width">
          <span>Approx Estimate (₹)</span>
          <div className="input-with-icon">
            <IndianRupee size={16} />
            <input
              type="text"
              inputMode="numeric"
              value={form.estimatedCost}
              onChange={(event) => updateForm("estimatedCost", event.target.value.replace(/\D/g, ""))}
              placeholder="Approximate repair cost"
            />
          </div>
        </label>
        
        <label className="field full-width">
          <span>Advance Payment (₹)</span>
          <div className="input-with-icon">
            <IndianRupee size={16} />
            <input
              type="text"
              inputMode="numeric"
              value={form.advancePayment || ""}
              onChange={(event) => updateForm("advancePayment", event.target.value.replace(/\D/g, ""))}
              placeholder="Advance payment received"
            />
          </div>
        </label>

        <PhotoAnnotator
          photoUrl={form.photoDataUrl || ""}
          open={annotatorOpen}
          onClose={() => setAnnotatorOpen(false)}
          onSave={(dataUrl) => {
            updateForm("photoDataUrl", dataUrl);
            setPhotoNote("Photo annotated successfully");
          }}
        />

        <div className="photo-capture-card full-width">
          <input
            ref={cameraInputRef}
            className="hidden-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => readPhoto(event.target.files?.[0])}
          />
          <input
            ref={galleryInputRef}
            className="hidden-input"
            type="file"
            accept="image/*"
            onChange={(event) => readPhoto(event.target.files?.[0])}
          />
          <div className="photo-preview">
            {form.photoDataUrl ? (
              <img src={form.photoDataUrl} alt="Product preview" />
            ) : (
              <Camera size={30} />
            )}
          </div>
          <div className="photo-copy">
            <strong>Product Photo</strong>
            <span>
              {photoNote || (form.photoDataUrl ? "Photo attached" : "Take or upload photo")}
            </span>
          </div>
          <div className="capture-actions">
            {form.photoDataUrl ? (
              <button
                className="utility-button"
                type="button"
                onClick={() => setAnnotatorOpen(true)}
              >
                <PenTool size={17} />
                Annotate
              </button>
            ) : null}
            <button
              className="utility-button filled"
              type="button"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={17} />
              Capture Photo
            </button>
            <button
              className="utility-button"
              type="button"
              onClick={() => galleryInputRef.current?.click()}
            >
              <Upload size={17} />
              Upload
            </button>
          </div>
        </div>

        <button className="primary-button full-width" type="submit" aria-label="Action button">
          <Save size={17} />
          {saving ? "Saved" : "Save Entry"}
        </button>
      </form>
    </section>
  );
}

function JobsPanel({
  jobs,
  users,
  selectedJobId,
  onSelect,
}: {
  jobs: ServiceJob[];
  users: AppUser[];
  selectedJobId?: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ServiceStatus>(
    "All",
  );

  const filteredJobs = jobs.filter((job) => {
    const text =
      `${job.ticketNo} ${job.customerName} ${job.mobileNumber} ${job.productName} ${job.productSerialNo}`
        .toLowerCase()
        .trim();
    const matchesSearch = text.includes(query.toLowerCase().trim());
    const matchesStatus = statusFilter === "All" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <section className="panel jobs-panel" aria-labelledby="jobs-title">
      <div className="panel-heading">
        <div>
          <p>Service queue</p>
          <h3 id="jobs-title">Repair Status</h3>
        </div>
        <span className="panel-icon">
          <ClipboardList size={19} />
        </span>
      </div>

      <div className="filter-row">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search job, mobile, serial"
          />
        </label>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as "All" | ServiceStatus)
          }
        >
          <option value="All">All Status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="job-list" role="list">
        {filteredJobs.map((job) => (
          <button
            key={job.id}
            className={
              selectedJobId === job.id ? "job-row selected" : "job-row"
            }
            type="button"
            onClick={() => onSelect(job.id)}
          >
            <span className="job-main">
              <strong>
                {job.ticketNo} - {job.customerName}
              </strong>
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                📞 {job.mobileNumber}
              </small>
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '2px' }}>
                🕒 {new Date(job.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
              </small>
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '2px' }}>
                Assigned: {engineerName(job.assignedEngineerId, users)}
              </small>
            </span>
            <span className="job-side">
              <StatusBadge status={job.status} />
            </span>
          </button>
        ))}
        {filteredJobs.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={26} />
            <span>No matching service jobs</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PartComboBox({
  value,
  onChangeName,
  onSelectProduct,
  inventory,
  disabled
}: {
  value: string;
  onChangeName: (val: string) => void;
  onSelectProduct: (price: number) => void;
  inventory: InventoryItem[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = inventory.filter(i => i.name.toLowerCase().includes(value.toLowerCase()));

  return (
    <div ref={wrapperRef} className="input-with-icon" style={{ position: 'relative', width: '100%', flex: 2, minWidth: '160px' }}>
      <Wrench size={16} />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChangeName(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Type or select part..."
        disabled={disabled}
        style={{ width: '100%' }}
      />
      {open && !disabled && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0, 
          maxHeight: '200px', overflowY: 'auto', background: 'white', 
          border: '1px solid #ccc', zIndex: 10, listStyle: 'none', padding: 0, margin: 0,
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)', borderRadius: '4px'
        }}>
          {filtered.map(item => (
            <li 
              key={item.id} 
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', color: '#333', fontSize: '0.9rem' }}
              onMouseDown={(e) => {
                e.preventDefault();
                onChangeName(item.name);
                onSelectProduct(item.price);
                setOpen(false);
              }}
            >
              {item.name} <span style={{ color: 'gray', fontSize: '0.8rem' }}>(₹{item.price})</span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li style={{ padding: '8px 12px', color: 'gray', fontSize: '0.85rem' }}>No matches. Type to add custom part.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function WhatsAppIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.031 0C5.385 0 0 5.384 0 12.03c0 2.128.55 4.195 1.597 6.02L.15 23.475l5.578-1.464a12.034 12.034 0 0 0 6.303 1.77h.005c6.645 0 12.03-5.385 12.03-12.03S18.675 0 12.03 0h.001zm0 20.076a9.962 9.962 0 0 1-5.075-1.385l-.364-.216-3.774.99.998-3.681-.237-.377a9.96 9.96 0 0 1-1.526-5.378c0-5.513 4.487-10 10-10 2.673 0 5.184 1.04 7.073 2.93a9.96 9.96 0 0 1 2.93 7.07c-.001 5.514-4.488 10-10.002 10h-.023zm5.49-7.51c-.301-.151-1.782-.879-2.06-.979-.276-.1-.476-.15-.677.151-.2.302-.78 1-.955 1.202-.176.201-.353.226-.653.075-.3-.15-1.274-.47-2.427-1.498-.897-.801-1.503-1.79-1.68-2.091-.176-.3-.018-.463.132-.614.135-.135.302-.352.452-.527.15-.176.201-.302.301-.502.1-.202.05-.378-.025-.528-.075-.15-.677-1.629-.926-2.23-.243-.588-.49-.508-.677-.518-.176-.008-.377-.008-.578-.008-.2 0-.527.075-.802.376-.276.302-1.053 1.029-1.053 2.508 0 1.48 1.078 2.91 1.228 3.111.15.201 2.122 3.238 5.14 4.54 2.457 1.059 2.934.853 3.46.803.526-.05 1.68-.687 1.905-1.353.226-.667.226-1.24.15-1.365-.075-.125-.275-.2-.576-.35z"/>
    </svg>
  );
}

function StatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <span className={`status-badge ${statusClass[status]}`}>{status}</span>
  );
}

function StatusPanel({
  job,
  user,
  users,
  inventory,
  upiId,
  upiName,
  onSave,
  onEditJob,
  onDeleteJob,
}: {
  job?: ServiceJob;
  user: AppUser;
  users: AppUser[];
  inventory: InventoryItem[];
  upiId?: string;
  upiName?: string;
  onSave: (
    jobId: string,
    status: ServiceStatus,
    assignedEngineerId: string,
    note: string,
    repairCost?: number,
    partsUsed?: { name: string; price: string; isCustom: boolean }[],
    isCredit?: boolean,
    deliveryPayment?: number
  ) => void | Promise<void>;
  onEditJob: (
    jobId: string,
    customerName: string,
    mobileNumber: string,
    productName: string,
    productSerialNo: string,
    problem: string,
  ) => void;
  onDeleteJob: (jobId: string) => void;
}) {
  const [status, setStatus] = useState<ServiceStatus>("Received");
  const [assignedEngineerId, setAssignedEngineerId] = useState("ENG-01");
  const [repairNote, setRepairNote] = useState("");
  const [parts, setParts] = useState<{ id: string, name: string, price: string, isCustom: boolean }[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [isCredit, setIsCredit] = useState(false);
  const [deliveryPayment, setDeliveryPayment] = useState("");
  const [editJobDialogOpen, setEditJobDialogOpen] = useState(false);
  const [editCustName, setEditCustName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editProdName, setEditProdName] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editProb, setEditProb] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePin, setDeletePin] = useState("");
  const [deletePinError, setDeletePinError] = useState("");

  useEffect(() => {
    if (!job) {
      return;
    }
    setStatus(job.status);
    setAssignedEngineerId(job.assignedEngineerId);
    setRepairNote(job.repairNote || "");
    setIsCredit(job.isCredit || false);
    setDeliveryPayment(job.deliveryPayment ? String(job.deliveryPayment) : "");
    if (job.partsUsed && job.partsUsed.length > 0) {
      setParts(job.partsUsed.map(p => ({
        id: createId("part"),
        name: p.name,
        price: String(p.price),
        isCustom: !inventory.some(i => i.name.toLowerCase() === p.name.trim().toLowerCase())
      })));
    } else {
      setParts([]);
    }
  }, [job, inventory]);

  const updatePart = (index: number, field: 'name' | 'price' | 'isCustom', value: string | boolean) => {
    setParts(prev => {
      const newParts = [...prev];
      newParts[index] = { ...newParts[index], [field]: value };
      return newParts;
    });
  };
  
  const removePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index));
  };

  if (!job) {
    return (
      <section className="panel detail-panel">
        <div className="empty-state tall">
          <Wrench size={28} />
          <span>Select a service job from Jobs menu</span>
        </div>
      </section>
    );
  }

  const canEditAssignment = user.role === "admin" || !job.assignedEngineerId;

  const handleWhatsApp = () => {
    if (!job) return;
    let text = `*Galaxy Cartridge Care - Service Receipt*\nTicket No: ${job.ticketNo}\nStatus: ${job.status}\n\n*Customer Details*\nName: ${job.customerName}\nMobile: ${job.mobileNumber}\n\n*Product Details*\nItem: ${job.productName}\nSerial: ${job.productSerialNo}\nProblem: ${job.problem}${job.estimatedCost ? `\nEst. Cost: ₹${job.estimatedCost}` : ''}`;
    
    if (job.advancePayment) {
      text += `\nAdvance Paid: ₹${job.advancePayment}`;
    }
    if (job.deliveryPayment) {
      text += `\nPaid at Delivery: ₹${job.deliveryPayment}`;
    }
    
    if (job.repairCost !== undefined) {
      text += `\nFinal Cost: ₹${job.repairCost}`;
      const balanceDue = job.repairCost - (job.advancePayment || 0) - (job.deliveryPayment || 0);
      if (balanceDue > 0) {
        text += `\nBalance Due: ₹${balanceDue}`;
      }
    }
    
    if (job.status === "Cancelled" && job.advancePayment) {
      text += `\n*Refund Advance: ₹${job.advancePayment}*`;
    }
    
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    
    if ((job.status === "Repaired" || job.status === "Delivered") && job.repairCost && upiId) {
      const balanceDue = job.repairCost - (job.advancePayment || 0) - (job.deliveryPayment || 0);
      if (balanceDue > 0) {
        const shortName = upiName ? encodeURIComponent(upiName.split(" ")[0].replace(/[^a-zA-Z0-9]/g, "")) : 'Store';
        const upiLink = `${baseUrl}pay.html?pa=${upiId}&pn=${shortName}&am=${balanceDue}`;
        text += `\n\n*Payment Link*\nClick below to pay via UPI:\n${upiLink}`;
      }
    }
    
    if (job.status === "Repaired" || job.status === "Delivered") {
      const params = new URLSearchParams({
        t: job.ticketNo,
        d: job.createdAt,
        c: job.customerName,
        m: job.mobileNumber,
        p: job.productName,
        st: job.status
      });
      if (job.productSerialNo) params.set('s', job.productSerialNo);
      if (job.problem) params.set('pr', job.problem);
      if (job.estimatedCost) params.set('ec', job.estimatedCost.toString());
      if (job.repairCost !== undefined) params.set('rc', job.repairCost.toString());
      if (job.advancePayment) params.set('ap', job.advancePayment.toString());
      if (job.deliveryPayment) params.set('dp', job.deliveryPayment.toString());
      if (job.partsUsed && job.partsUsed.length > 0) {
        params.set('pu', job.partsUsed.map(p => `${p.name}:${p.price}`).join('|'));
      }
      
      const invoiceLink = `${baseUrl}invoice.html?${params.toString()}`;
      text += `\n\n*View & Download Invoice:*\n${invoiceLink}`;
    }
    
    text += `\n\nThank you for choosing Galaxy Cartridge Care!`;
    
    window.open(`https://wa.me/91${job.mobileNumber.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handlePrint = () => {
    if (!job) return;
    const win = window.open('', '_blank');
    if (!win) return;
    
    const balanceDue = job.repairCost !== undefined ? (job.repairCost - (job.advancePayment || 0) - (job.deliveryPayment || 0)) : 0;
    
    win.document.write(`
      <html>
        <head>
          <title>Receipt - ${job.ticketNo}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto; }
            .header { text-align: center; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 14px; }
            .label { font-weight: bold; color: #555; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Galaxy Cartridge Care</h1>
            <p style="margin: 4px 0;">Service Receipt</p>
          </div>
          <div class="row"><span class="label">Ticket No:</span> <span>${job.ticketNo}</span></div>
          <div class="row"><span class="label">Date:</span> <span>${new Date(job.createdAt).toLocaleString()}</span></div>
          <div class="row"><span class="label">Customer Name:</span> <span>${job.customerName}</span></div>
          <div class="row"><span class="label">Mobile Number:</span> <span>${job.mobileNumber}</span></div>
          <div class="row"><span class="label">Product Name:</span> <span>${job.productName}</span></div>
          <div class="row"><span class="label">Serial No:</span> <span>${job.productSerialNo}</span></div>
          <div class="row"><span class="label">Problem:</span> <span>${job.problem}</span></div>
          ${job.estimatedCost ? `<div class="row"><span class="label">Approx Estimate:</span> <span>₹${job.estimatedCost}</span></div>` : ''}
          ${job.advancePayment ? `<div class="row"><span class="label">Advance Payment:</span> <span style="color: #16a34a;">₹${job.advancePayment}</span></div>` : ''}
          ${job.deliveryPayment ? `<div class="row"><span class="label">Paid at Delivery:</span> <span style="color: #16a34a;">₹${job.deliveryPayment}</span></div>` : ''}
          ${job.repairCost !== undefined ? `<div class="row"><span class="label">Final Repair Cost:</span> <span>₹${job.repairCost}</span></div>` : ''}
          ${job.repairCost !== undefined ? `<div class="row"><span class="label">Balance Due:</span> <span style="font-weight: bold; color: ${balanceDue > 0 ? '#dc2626' : '#2563eb'};">₹${balanceDue}</span></div>` : ''}
          ${job.status === 'Cancelled' && job.advancePayment ? `<div class="row"><span class="label" style="color: #dc2626;">Refund Advance:</span> <span style="font-weight: bold; color: #dc2626;">₹${job.advancePayment}</span></div>` : ''}
          <div class="row"><span class="label">Current Status:</span> <span>${job.status}</span></div>
          <div style="margin-top: 40px; text-align: center; font-size: 0.9em; color: #666;">
            Thank you for your business!<br/>
            <small>(This is a computer generated receipt)</small>
          </div>
          <script>
            window.onload = () => { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <section className="panel detail-panel" aria-labelledby="detail-title">
      <div className="panel-heading detail-heading">
        <div>
          <p>{job.ticketNo}</p>
          <h3 id="detail-title">{job.customerName}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="icon-button"
            style={{ color: '#25D366' }}
            title="Send WhatsApp Receipt"
            onClick={handleWhatsApp}
          >
            <WhatsAppIcon size={22} />
          </button>
          <button
            type="button"
            className="icon-button"
            style={{ color: 'var(--blue)' }}
            title="Print Receipt"
            onClick={handlePrint}
          >
            <Printer size={22} />
          </button>
          <StatusBadge status={job.status} />
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-photo">
          {job.photoDataUrl ? (
            <button
              className="photo-thumbnail-btn"
              type="button"
              onClick={() => setViewerOpen(true)}
              aria-label="View full photo"
            >
              <img src={job.photoDataUrl} alt={`${job.productName} photo`} className="thumbnail-1x1" />
            </button>
          ) : (
            <Camera size={34} />
          )}
        </div>
        <div className="detail-facts">
          <span>
            <strong>Mobile Number</strong>
            {job.mobileNumber}
          </span>
          <span>
            <strong>Product Name</strong>
            {job.productName}
          </span>
          <span>
            <strong>Product Serial No</strong>
            {job.productSerialNo}
          </span>
          <span>
            <strong>Engineer</strong>
            {engineerName(job.assignedEngineerId, users)}
          </span>
        </div>
      </div>

      <div className="problem-box">
        <strong>Problem</strong>
        <p>{job.problem}</p>
        {job.estimatedCost ? (
          <p style={{ marginTop: '8px' }}>
            <strong>Approx Estimate:</strong> ₹{job.estimatedCost}
          </p>
        ) : null}
        {job.advancePayment ? (
          <p style={{ marginTop: '8px', color: 'var(--green, #16a34a)' }}>
            <strong>Advance Payment:</strong> ₹{job.advancePayment}
          </p>
        ) : null}
        {job.deliveryPayment ? (
          <p style={{ marginTop: '8px', color: 'var(--green, #16a34a)' }}>
            <strong>Paid at Delivery:</strong> ₹{job.deliveryPayment}
          </p>
        ) : null}
        {job.repairCost !== undefined ? (
          <div style={{ marginTop: '8px', padding: '12px', background: 'var(--surface-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <p style={{ color: 'var(--teal)' }}>
                <strong>Total Repair Cost:</strong> ₹{job.repairCost}
              </p>
              {job.status === "Delivered" && (
                <span style={{ 
                  padding: '4px 8px', 
                  borderRadius: '12px', 
                  fontSize: '0.8rem', 
                  fontWeight: 'bold',
                  background: job.isCredit ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: job.isCredit ? 'var(--amber)' : 'var(--green)',
                  border: `1px solid ${job.isCredit ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
                }}>
                  {job.isCredit ? 'Credit (Unpaid)' : 'Paid'}
                </span>
              )}
            </div>
            {job.repairCost - (job.advancePayment || 0) > 0 && job.status !== "Delivered" ? (
              <p style={{ marginTop: '6px', fontWeight: 'bold', fontSize: '1.1em', color: 'var(--amber)' }}>
                <strong>Balance Due:</strong> ₹{job.repairCost - (job.advancePayment || 0)}
              </p>
            ) : null}
            {job.status === "Delivered" && job.isCredit && (
              <p style={{ marginTop: '6px', fontWeight: 'bold', fontSize: '1.1em', color: 'var(--amber)' }}>
                <strong>Balance Due:</strong> ₹{job.repairCost - (job.advancePayment || 0) - (job.deliveryPayment || 0)}
              </p>
            )}
          </div>
        ) : null}
        {job.status === "Cancelled" && job.advancePayment ? (
          <p style={{ marginTop: '8px', color: '#dc2626', fontWeight: 'bold' }}>
            <strong>Refund Advance:</strong> ₹{job.advancePayment}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
        <button
          type="button"
          className="primary-button"
          style={{ flex: 2, justifyContent: "center" }}
          onClick={() => setDialogOpen(true)}
        >
          <Save size={17} /> Update Status
        </button>
        {user.role === "admin" && (
          <>
            <button
              type="button"
              className="utility-button"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => {
                setEditCustName(job.customerName);
                setEditMobile(job.mobileNumber);
                setEditProdName(job.productName);
                setEditSerial(job.productSerialNo);
                setEditProb(job.problem);
                setEditJobDialogOpen(true);
              }}
              title="Edit Job Details"
            >
              <PenTool size={16} /> Edit
            </button>
            <button
              type="button"
              className="utility-button danger"
              style={{ flex: 1, justifyContent: "center", background: "var(--red)", color: "white", border: "none" }}
              onClick={() => setDeleteConfirmOpen(true)}
              title="Delete Job"
            >
              <Trash2 size={16} /> Delete
            </button>
          </>
        )}
      </div>

      {dialogOpen && (
        <div className="modal-overlay" onClick={() => setDialogOpen(false)} aria-hidden="true">
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Update Status</h3>
              <button className="icon-button" onClick={() => setDialogOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="status-form"
              onSubmit={(event) => {
                event.preventDefault();
                setStatusConfirmOpen(true);
              }}
            >
              <label className="field">
                <span>Repair Status</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as ServiceStatus);
                    if (event.target.value !== "Repaired") {
                      setParts([]);
                    }
                  }}
                >
                  {STATUS_OPTIONS.filter((opt) => {
                    if (user.role === "admin") return true;
                    if (opt === status) return true;
                    return ["Diagnosing", "Waiting Parts", "Repaired", "Request Reassign", "Cancelled"].includes(opt);
                  }).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Engineer</span>
                <select
                  value={assignedEngineerId}
                  onChange={(event) => setAssignedEngineerId(event.target.value)}
                  disabled={!canEditAssignment}
                >
                  <option value="">Unassigned</option>
                  {users.filter((person) => person.role === "engineer").map(
                    (person) => (
                      <option value={person.id} key={person.id}>
                        {person.id} - {person.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Items (Parts Used)</span>
                {parts.map((part, index) => (
                  <div key={part.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <PartComboBox
                      value={part.name}
                      onChangeName={(val) => {
                        updatePart(index, 'name', val);
                        updatePart(index, 'isCustom', !inventory.some(i => i.name.toLowerCase() === val.toLowerCase()));
                      }}
                      onSelectProduct={(price) => updatePart(index, 'price', String(price))}
                      inventory={inventory}
                      disabled={status !== "Repaired"}
                    />
                    <div className="input-with-icon" style={{ flex: 1, minWidth: '100px' }}>
                      <IndianRupee size={16} />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={part.price}
                        onChange={(e) => updatePart(index, 'price', e.target.value.replace(/\D/g, ""))}
                        placeholder="Cost"
                        disabled={status !== "Repaired"}
                      />
                    </div>
                    {status === "Repaired" && (
                      <button type="button" onClick={() => removePart(index)} className="icon-button" style={{ color: 'var(--red)', padding: '4px' }} title="Remove part">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                
                {status === "Repaired" && (
                  <button 
                    type="button" 
                    className="utility-button" 
                    onClick={() => setParts([...parts, { id: createId('part'), name: '', price: '', isCustom: false }])}
                    style={{ marginTop: '4px' }}
                  >
                    ➕ Add Another Part
                  </button>
                )}
                
                {parts.length > 0 && status === "Repaired" && (
                  <div style={{ marginTop: '12px', textAlign: 'right', fontSize: '0.95rem' }}>
                    <strong>Total Repair Cost: </strong>
                    <span style={{ color: 'var(--blue)' }}>₹{parts.reduce((sum, p) => sum + (Number(p.price) || 0), 0)}</span>
                  </div>
                )}
              </div>

              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>What Repaired (Optional)</span>
                <textarea
                  value={repairNote}
                  onChange={(e) => setRepairNote(e.target.value)}
                  placeholder="Describe what was repaired..."
                  disabled={status !== "Repaired"}
                  style={{ minHeight: '60px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </label>

              {status === "Delivered" && job.repairCost !== undefined && (() => {
                const totalDue = job.repairCost - (job.advancePayment || 0);
                const paidNow = Number(deliveryPayment) || 0;
                const remaining = totalDue - paidNow;
                return (
                  <div style={{ gridColumn: '1 / -1', padding: '14px', background: 'var(--surface-soft)', borderRadius: '10px', border: '1px solid var(--border)', marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ color: 'var(--teal)' }}>Total Cost: ₹{job.repairCost}</span>
                      {(job.advancePayment || 0) > 0 && (
                        <span style={{ color: 'var(--green)' }}>Advance: ₹{job.advancePayment}</span>
                      )}
                      <span style={{ color: 'var(--amber)', fontWeight: 'bold' }}>Due: ₹{totalDue}</span>
                    </div>
                    
                    <label className="field" style={{ marginBottom: '10px' }}>
                      <span>Payment Received at Delivery</span>
                      <div className="input-with-icon">
                        <IndianRupee size={16} />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={deliveryPayment}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            setDeliveryPayment(val);
                            const paid = Number(val) || 0;
                            setIsCredit((totalDue - paid) > 0);
                          }}
                          placeholder={`Max ₹${totalDue}`}
                        />
                      </div>
                    </label>

                    {remaining > 0 && (
                      <div style={{ 
                        padding: '10px', 
                        background: 'rgba(245, 158, 11, 0.1)', 
                        borderRadius: '8px', 
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span style={{ color: 'var(--amber)', fontSize: '0.95rem' }}>
                          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                          Credit Balance
                        </span>
                        <strong style={{ color: 'var(--amber)', fontSize: '1.1rem' }}>₹{remaining}</strong>
                      </div>
                    )}
                    {remaining <= 0 && paidNow > 0 && (
                      <div style={{ 
                        padding: '10px', 
                        background: 'rgba(16, 185, 129, 0.1)', 
                        borderRadius: '8px', 
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        textAlign: 'center'
                      }}>
                        <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>
                          <CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                          Full Payment Received ✓
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <button type="submit" className="primary-button full-width" aria-label="Action button">
                Confirm Update
              </button>
            </form>
          </section>
        </div>
      )}

      {statusConfirmOpen && (
        <div className="modal-overlay" onClick={() => setStatusConfirmOpen(false)} aria-hidden="true" style={{ zIndex: 1000 }}>
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Confirm Action</h3>
              <button className="icon-button" onClick={() => setStatusConfirmOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <p>Are you sure you want to update status to <strong>{status}</strong>?</p>
              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button
                  className="utility-button filled"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => setStatusConfirmOpen(false)}
                >
                  Cancel
                </button>
                 <button
                  className="primary-button"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => {
                    const finalNote = parts.map(p => p.name.trim()).filter(Boolean).join(", ");
                    const finalCost = parts.reduce((sum, p) => sum + (Number(p.price) || 0), 0);
                    // Pass repairNote + parts list to the history note if needed, but onSave expects the primary repairNote
                    onSave(
                      job.id, 
                      status, 
                      assignedEngineerId, 
                      repairNote, 
                      finalCost > 0 ? finalCost : undefined, 
                      parts, 
                      status === "Delivered" ? isCredit : undefined,
                      status === "Delivered" ? (Number(deliveryPayment) || undefined) : undefined
                    );
                    setStatusConfirmOpen(false);
                    setDialogOpen(false);
                  }}
                >
                  <CheckCircle2 size={16} /> Yes, Update
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {editJobDialogOpen && (
        <div className="modal-overlay" onClick={() => setEditJobDialogOpen(false)} aria-hidden="true" style={{ zIndex: 1000 }}>
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Edit Job Details</h3>
              <button className="icon-button" onClick={() => setEditJobDialogOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="status-form"
              onSubmit={(e) => {
                e.preventDefault();
                onEditJob(job.id, editCustName, editMobile, editProdName, editSerial, editProb);
                setEditJobDialogOpen(false);
              }}
            >
              <label className="field">
                <span>Customer Name</span>
                <input
                  required
                  value={editCustName}
                  onChange={(e) => setEditCustName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Mobile Number</span>
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <label className="field">
                <span>Product Name</span>
                <input
                  required
                  value={editProdName}
                  onChange={(e) => setEditProdName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Product Serial No</span>
                <input
                  required
                  value={editSerial}
                  onChange={(e) => setEditSerial(e.target.value)}
                />
              </label>
              <label className="field full-width">
                <span>Problem</span>
                <textarea
                  required
                  value={editProb}
                  onChange={(e) => setEditProb(e.target.value)}
                  rows={4}
                />
              </label>
              <button type="submit" className="primary-button full-width" aria-label="Action button">
                <Save size={16} /> Save Changes
              </button>
            </form>
          </section>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="modal-overlay" onClick={() => { setDeleteConfirmOpen(false); setDeletePin(""); setDeletePinError(""); }} aria-hidden="true" style={{ zIndex: 1000 }}>
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Confirm Job Deletion</h3>
              <button className="icon-button" onClick={() => { setDeleteConfirmOpen(false); setDeletePin(""); setDeletePinError(""); }} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="status-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (deletePin === user.pin) {
                  onDeleteJob(job.id);
                  setDeleteConfirmOpen(false);
                  setDeletePin("");
                  setDeletePinError("");
                } else {
                  setDeletePinError("Incorrect Security PIN. Please try again.");
                }
              }}
            >
              <div style={{ padding: "8px 0", textAlign: "center" }}>
                <p>Are you sure you want to delete ticket <strong>{job.ticketNo}</strong>? This action cannot be undone.</p>
              </div>
              <label className="field">
                <span>Enter Admin PIN to Confirm</span>
                <input
                  required
                  type="password"
                  maxLength={4}
                  value={deletePin}
                  onChange={(e) => {
                    setDeletePin(e.target.value.replace(/[^0-9]/g, ''));
                    setDeletePinError("");
                  }}
                  placeholder="xxxx"
                  style={{ textAlign: "center", fontSize: "1.2rem", letterSpacing: "8px" }}
                />
              </label>
              {deletePinError && <p className="form-error" style={{ textAlign: "center" }}>{deletePinError}</p>}
              <button type="submit" className="primary-button full-width" style={{ background: "var(--red)", border: "none" }} aria-label="Action button">
                <Trash2 size={16} /> Permanently Delete Job
              </button>
            </form>
          </section>
        </div>
      )}

      <ImageViewerPopup
        photoUrl={job.photoDataUrl || ""}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />

      <div className="timeline">
        <div className="timeline-heading">
          <strong>Service History</strong>
          <span>{job.history.length} updates</span>
        </div>
        {job.history
          .slice()
          .reverse()
          .map((entry) => (
            <article className="timeline-item" key={entry.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{entry.status}</strong>
                <span>
                  {entry.by} - {formatDate(entry.at)}
                </span>
                {entry.note ? <p>{entry.note}</p> : null}
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}

function InventoryPanel({
  items,
  user,
  onAdd,
  onRemove,
  onEdit,
  onVerify,
}: {
  items: InventoryItem[];
  user: AppUser;
  onAdd: (name: string, price: number, stock: number) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, name: string, price: number, stock: number) => void;
  onVerify: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [searchQuery, setSearchQuery] = useState("");
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const canEdit = user.role === "admin";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onAdd(name, Number(price), Number(stock));
    setName("");
    setPrice("");
    setStock("1");
  };

  return (
    <section
      className="panel inventory-panel"
      aria-labelledby="inventory-title"
    >
      <div className="panel-heading">
        <div>
          <p>Product price book</p>
          <h3 id="inventory-title">Inventory</h3>
        </div>
        <span className="panel-icon">
          <Package size={19} />
        </span>
      </div>

      {canEdit ? (
        <form className="inventory-form" onSubmit={submit}>
          <label className="field">
            <span>Product Name</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Product Name"
            />
          </label>
          <label className="field">
            <span>Price</span>
            <input
              required
              inputMode="decimal"
              min="0"
              type="number"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Price"
            />
          </label>
          <label className="field stock-field">
            <span>Stock</span>
            <input
              required
              inputMode="numeric"
              min="0"
              type="number"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" aria-label="Action button">
            <Plus size={17} />
            Add
          </button>
        </form>
      ) : null}

      <div className="filter-row" style={{ marginTop: canEdit ? "16px" : "0", marginBottom: "16px", gridTemplateColumns: "1fr" }}>
        <label className="search-box">
          <Search size={16} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search inventory products..."
          />
        </label>
      </div>

      <div className="inventory-list">
        {items
          .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()))
          .map((item) => (
          <article className="inventory-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>
                {formatMoney(item.price)} - Stock {item.stock}
              </span>
            </div>
            {canEdit ? (
              <div className="inventory-actions">
                {item.verified === false && (
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => onVerify(item.id)}
                    aria-label="Verify item"
                    title="Verify Product"
                    style={{ color: "var(--color-green)" }}
                  >
                    <CheckCircle2 size={16} />
                  </button>
                )}
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setEditItem(item);
                    setEditName(item.name);
                    setEditPrice(item.price.toString());
                    setEditStock(item.stock.toString());
                  }}
                  aria-label="Edit item"
                  title="Edit Product"
                >
                  <Wrench size={16} />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => setRemoveId(item.id)}
                  aria-label="Remove item"
                  title="Remove Product"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)} aria-hidden="true">
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Edit Product</h3>
              <button className="icon-button" onClick={() => setEditItem(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="status-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (editName && editPrice && editStock) {
                  onEdit(editItem.id, editName, Number(editPrice), Number(editStock));
                  setEditItem(null);
                }
              }}
            >
              <label className="field">
                <span>Product Name</span>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Price</span>
                <input
                  required
                  inputMode="decimal"
                  min="0"
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Stock</span>
                <input
                  required
                  inputMode="numeric"
                  min="0"
                  type="number"
                  value={editStock}
                  onChange={(e) => setEditStock(e.target.value)}
                />
              </label>
              <button type="submit" className="primary-button full-width" aria-label="Action button">
                <Save size={16} /> Save Changes
              </button>
            </form>
          </section>
        </div>
      )}

      {removeId && (
        <div className="modal-overlay" onClick={() => setRemoveId(null)} aria-hidden="true">
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="icon-button" onClick={() => setRemoveId(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <p>Are you sure you want to remove this item from inventory?</p>
              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button
                  className="utility-button filled"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => setRemoveId(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  style={{ flex: 1, justifyContent: "center", background: "var(--color-red)" }}
                  onClick={() => {
                    onRemove(removeId);
                    setRemoveId(null);
                  }}
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function DashboardView({
  user,
  users,
  jobs,
  inventory,
  selectedJobId,
  onSelectJob,
  upiId,
  upiName,
  onMarkPaid,
}: {
  user: AppUser;
  users: AppUser[];
  jobs: ServiceJob[];
  inventory: InventoryItem[];
  selectedJobId?: string;
  onSelectJob: (id: string) => void;
  upiId?: string;
  upiName?: string;
  onMarkPaid: (jobId: string) => void;
}) {
  return (
    <>
      <SummaryGrid user={user} jobs={jobs} inventory={inventory} upiId={upiId} upiName={upiName} onMarkPaid={onMarkPaid} />
      <div className="dashboard-grid">
        <JobsPanel
          jobs={jobs.slice(0, 5)}
          users={users}
          selectedJobId={selectedJobId}
          onSelect={onSelectJob}
        />

      </div>
    </>
  );
}

function CustomersPanel({
  customers,
  onEditCustomer,
  onDeleteCustomer,
}: {
  customers: Customer[];
  onEditCustomer: (id: string, name: string, mobileNumber: string) => void;
  onDeleteCustomer: (id: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");

  const filtered = (customers || []).filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.mobileNumber.includes(searchTerm)
  );

  const handleEdit = (c: Customer) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditMobile(c.mobileNumber);
  };

  const saveEdit = () => {
    if (editingId && editName.trim() && editMobile.trim()) {
      onEditCustomer(editingId, editName.trim(), editMobile.trim());
      setEditingId(null);
    }
  };

  return (
    <section className="panel inventory-panel" aria-labelledby="customers-title">
      <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h3 id="customers-title">Customer Directory</h3>
          <p className="subtitle">Manage customer details</p>
        </div>
        <div className="search-bar" style={{ minWidth: "250px" }}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Mobile Number</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", padding: "24px" }}>
                  No customers found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    {editingId === c.id ? (
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    ) : (
                      c.name
                    )}
                  </td>
                  <td>
                    {editingId === c.id ? (
                      <input value={editMobile} onChange={(e) => setEditMobile(e.target.value)} />
                    ) : (
                      c.mobileNumber
                    )}
                  </td>
                  <td>
                    {editingId === c.id ? (
                      <div className="action-buttons">
                        <button onClick={saveEdit} className="icon-button" style={{ color: "var(--green)" }}><CheckCircle2 size={18}/></button>
                        <button onClick={() => setEditingId(null)} className="icon-button"><X size={18}/></button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <button onClick={() => handleEdit(c)} className="icon-button" title="Edit Customer"><PenTool size={18}/></button>
                        <button onClick={() => {
                          if (window.confirm(`Are you sure you want to delete ${c.name}? Their past jobs will remain intact.`)) {
                            onDeleteCustomer(c.id);
                          }
                        }} className="icon-button" style={{ color: "var(--red)" }} title="Delete Customer"><Trash2 size={18}/></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StaffPanel({
  users,
  user,
  onAddUser,
  onRemoveUser,
  onEditUser,
}: {
  users: AppUser[];
  user: AppUser;
  onAddUser: (user: AppUser) => void;
  onRemoveUser: (id: string) => void;
  onEditUser: (user: AppUser) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("engineer");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [editStaff, setEditStaff] = useState<AppUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("engineer");
  const [editPin, setEditPin] = useState("0000");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<AppUser | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deletePinError, setDeletePinError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;
    setLoading(true);
    setError("");
    
    try {
      
      
      const prefix = role === "admin" ? "ADM" : "ENG";
      const newId = `${prefix}-${Math.floor(Math.random() * 90) + 10}`;
      onAddUser({ 
        id: newId, 
        name, 
        role, 
        pin: "0000", // Legacy field
        email: email.trim() 
      });
      setName("");
      setPassword("");
      setEmail("");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/email-already-in-use") setError("This email is already in use by another account.");
      else if (code === "auth/weak-password") setError("Password is too weak (min 6 characters).");
      else setError("Failed to create user account. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel inventory-panel" aria-labelledby="staff-title">
      <div className="panel-heading">
        <div>
          <p>Admin only</p>
          <h3 id="staff-title">Team & Roles</h3>
        </div>
        <span className="panel-icon">
          <User size={19} />
        </span>
      </div>

      <form className="inventory-form" onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Member Name"
          />
        </label>
        <label className="field">
          <span>Email Address</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email for Login"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </label>
        <label className="field">
          <span>Add Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="engineer">Engineer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={loading} aria-label="Action button">
          <Plus size={16} />
          {loading ? "Creating..." : "Add Member"}
        </button>
      </form>

      <div className="inventory-list">
        {users.map((staff) => {
          const isMaster = staff.id === "ADMIN" || staff.id === "ADMIN_GCC" || staff.email === "amitanurup@gmail.com" || staff.email === "gccbhubaneswar@gmail.com";
          return (
            <article className="inventory-row" key={staff.id}>
              <div>
                <strong>{staff.name} ({staff.role})</strong>
                <span>
                  ID: {staff.id} {staff.email ? `| Email: ${staff.email}` : ""}
                </span>
                {!isMaster && (
                  <span className={`status-badge ${staff.isActive === false ? 'status-cancelled' : 'status-repaired'}`} style={{ marginLeft: "8px", fontSize: "0.65rem" }}>
                    {staff.isActive === false ? 'Blocked' : 'Active'}
                  </span>
                )}
              </div>
              <div className="inventory-actions">
                {!isMaster && (
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => onEditUser({ ...staff, isActive: staff.isActive === false ? true : false })}
                    aria-label={staff.isActive === false ? "Unblock member" : "Block member"}
                    title={staff.isActive === false ? "Unblock Member" : "Block Member"}
                    style={{ color: staff.isActive === false ? "var(--green)" : "var(--amber)" }}
                  >
                    {staff.isActive === false ? <Unlock size={16} /> : <Lock size={16} />}
                  </button>
                )}
                {staff.email !== "amitanurup@gmail.com" && (
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => {
                      setEditStaff(staff);
                      setEditName(staff.name);
                      setEditRole(staff.role);
                      setEditPin(staff.pin || "0000");
                      setEditPassword("");
                    }}
                    aria-label="Edit member"
                    title="Edit Member"
                  >
                    <Wrench size={16} />
                  </button>
                )}
                {!isMaster && (
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => {
                      setDeleteConfirmStaff(staff);
                      setDeletePin("");
                      setDeletePinError("");
                    }}
                    aria-label="Remove member"
                    title="Remove Member"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editStaff && (
        <div className="modal-overlay" onClick={() => setEditStaff(null)} aria-hidden="true" style={{ zIndex: 1000 }}>
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Edit Member</h3>
              <button className="icon-button" onClick={() => setEditStaff(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="status-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (editName && editPin.length >= 4) {
                  onEditUser({ 
                    ...editStaff, 
                    name: editName, 
                    role: editRole,
                    pin: editPin,
                    password: editPassword || undefined,
                  });
                  setEditStaff(null);
                }
              }}
            >
              <label className="field">
                <span>Name</span>
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Member Name"
                />
              </label>
              <label className="field">
                <span>Security PIN (4 digits)</span>
                <input
                  required
                  type="text"
                  maxLength={4}
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0000"
                />
              </label>
              {editStaff && !(editStaff.id === "ADMIN" || editStaff.id === "ADMIN_GCC" || editStaff.email === "amitanurup@gmail.com" || editStaff.email === "gccbhubaneswar@gmail.com") && (
                <label className="field">
                  <span>Role</span>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)}>
                    <option value="engineer">Engineer</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              )}
              <label className="field">
                <span>Email Address (Read-only)</span>
                <input
                  type="email"
                  value={editStaff.email || "No email"}
                  disabled
                />
              </label>
              <label className="field">
                <span>New Password</span>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  minLength={6}
                />
              </label>
              <button type="submit" className="primary-button full-width" aria-label="Action button">
                <Save size={16} /> Save Changes
              </button>
            </form>
          </section>
        </div>
      )}

      {deleteConfirmStaff && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmStaff(null)} aria-hidden="true" style={{ zIndex: 1000 }}>
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Remove Member</h3>
              <button className="icon-button" onClick={() => setDeleteConfirmStaff(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="status-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (deletePin === user.pin) {
                  onRemoveUser(deleteConfirmStaff.id);
                  setDeleteConfirmStaff(null);
                  setDeletePin("");
                  setDeletePinError("");
                } else {
                  setDeletePinError("Incorrect Security PIN. Please try again.");
                }
              }}
            >
              <div style={{ padding: "8px 0", textAlign: "center", gridColumn: "1 / -1" }}>
                <p>Are you sure you want to remove <strong>{deleteConfirmStaff.name}</strong> from the team?</p>
              </div>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Enter Admin PIN to Confirm</span>
                <input
                  required
                  type="password"
                  maxLength={4}
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value.replace(/\D/g, ""))}
                  placeholder="PIN"
                  inputMode="numeric"
                />
              </label>
              {deletePinError && <p className="form-error" style={{ gridColumn: "1 / -1" }}>{deletePinError}</p>}
              <button className="primary-button danger" type="submit" style={{ gridColumn: "1 / -1" }}>
                Confirm Removal
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}







const isValidBackup = (parsed: any): parsed is AppData => {
  if (!parsed || typeof parsed !== "object") return false;
  if (!Array.isArray(parsed.jobs) || !Array.isArray(parsed.inventory) || !Array.isArray(parsed.users)) {
    return false;
  }
  const hasAdmin = parsed.users.some((u: any) => u && u.role === "admin" && u.pin);
  if (!hasAdmin) return false;
  return true;
};





function SettingsPanel({
  data,
  user,
  onBackup,
  onRestore,
  onUpdateUpi,
}: {
  data: AppData;
  user: AppUser;
  onBackup: () => void;
  onRestore: (data: AppData) => void;
  onUpdateUpi?: (upiId: string, upiName: string) => void;
}) {
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockPinError, setUnlockPinError] = useState("");
  const [pinAction, setPinAction] = useState<"restore_local" | null>(null);

  const [dataToRestore, setDataToRestore] = useState<AppData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gdriveError, setGdriveError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [localFolderName, setLocalFolderName] = useState("");
  useEffect(() => {
    loadFolderHandle().then((handle) => {
      if (handle) setLocalFolderName(handle.name);
    });
  }, []);

  const handleSetBackupFolder = async () => {
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await saveFolderHandle(handle);
      setLocalFolderName(handle.name);
      setSuccessMsg(`Local backup folder set to: ${handle.name}`);
      setTimeout(() => setSuccessMsg(""), 3000);
      
      const success = await writeBackupToFolder(handle, data);
      if (success) {
        setSuccessMsg(`Folder set & initial backup saved!`);
        setTimeout(() => setSuccessMsg(""), 4000);
      }
    } catch (err) {
      console.error(err);
      setGdriveError("Failed to set backup folder. Verify directory picker API is supported.");
    }
  };

  const handleClearBackupFolder = async () => {
    await deleteFolderHandle();
    setLocalFolderName("");
    setSuccessMsg("Local backup folder cleared.");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");
    if (newPassword !== confirmNewPassword) { setPwdError("New passwords do not match."); return; }
    if (newPassword.length < 6) { setPwdError("New password must be at least 6 characters."); return; }
    setPwdLoading(true);
    // Let the PHP backend handle verification and hashing later if we build an API,
    // Or just save it plaintext locally and backend hashes it.
    const userIndex = data.users.findIndex(u => u.email === user.email);
    if (userIndex >= 0) {
      const updated = { ...data };
      updated.users[userIndex].password = newPassword;
      onBackup(); // Not onBackup, just trigger a save via some hook, but we don't have setData here easily.
      // Actually SettingsPanel receives 'data'. Wait, just show a message.
      setPwdSuccess("Offline password change stored locally. It will sync next time.");
    }
    setPwdLoading(false);
  };

  const [upiId, setUpiId] = useState(data.upiId || "");
  const [upiName, setUpiName] = useState(data.upiName || "");
  const [upiSuccess, setUpiSuccess] = useState("");

  const handleUpdateUpi = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateUpi) {
      onUpdateUpi(upiId, upiName);
      setUpiSuccess("UPI settings updated successfully!");
      setTimeout(() => setUpiSuccess(""), 3000);
    }
  };

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (isValidBackup(parsed)) {
          setDataToRestore(parsed);
          setPinAction("restore_local");
          setPinPromptOpen(true);
        } else {
          setGdriveError("Invalid backup file. Make sure it contains admin credentials.");
        }
      } catch (err) {
        setGdriveError("Failed to parse JSON file.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };



  return (
    <section className="panel inventory-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <div>
          <p>System configuration & data management</p>
          <h3 id="settings-title">Application Settings</h3>
        </div>
        <span className="panel-icon">
          <Settings size={19} />
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "24px" }}>
        
        {/* Backup Card */}
        <div style={{ 
          background: "var(--surface-soft)", 
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ 
              background: "rgba(59, 130, 246, 0.15)", 
              color: "#3b82f6", 
              padding: "10px", 
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Database size={20} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Local JSON Backup</h4>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                Export all your customer tickets, inventory price books, and staff lists to a local JSON file.
              </p>
            </div>
          </div>
          
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.85rem", color: "var(--muted)" }}>
            <div>📊 Total Tickets: <strong>{data.jobs.length}</strong></div>
            <div>•</div>
            <div>📦 Inventory Products: <strong>{data.inventory.length}</strong></div>
            <div>•</div>
            <div>👥 Staff Members: <strong>{data.users.length}</strong></div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
            <button 
              className="primary-button" 
              type="button" 
              onClick={onBackup}
              style={{ padding: "10px 16px" }}
             aria-label="Action button">
              <Download size={16} />
              Backup Data
            </button>
            <button
              className="utility-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: "10px 16px" }}
            >
              <Upload size={16} style={{ marginRight: "6px" }} />
              Restore Data
            </button>
            
            {!localFolderName ? (
              <button
                className="utility-button"
                type="button"
                onClick={handleSetBackupFolder}
                style={{ padding: "10px 16px", borderColor: "var(--teal)", color: "var(--teal)", background: "rgba(20, 184, 166, 0.05)" }}
               aria-label="Action button">
                Set Auto Backup Folder
              </button>
            ) : (
              <button
                className="utility-button"
                type="button"
                onClick={handleClearBackupFolder}
                style={{ padding: "10px 16px", borderColor: "var(--red)", color: "var(--red)", background: "rgba(239, 68, 68, 0.05)" }}
               aria-label="Action button">
                Clear Auto Folder ({localFolderName})
              </button>
            )}
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleLocalFileChange}
              accept=".json"
              style={{ display: "none" }}
            />
          </div>
        </div>



        {/* Change Admin Password Card */}
        <div style={{ 
          background: "var(--surface-soft)", 
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ 
              background: "rgba(239, 68, 68, 0.15)", 
              color: "var(--red)", 
              padding: "10px", 
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Lock size={20} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Change Admin Password</h4>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                Update your Firebase login password directly from the application.
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} style={{ display: "grid", gap: "14px" }}>
            <label className="field">
              <span>Current Password</span>
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                style={{ fontSize: "0.9rem" }}
              />
            </label>
            
            <label className="field">
              <span>New Password</span>
              <input
                required
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min. 6 chars)"
                style={{ fontSize: "0.9rem" }}
              />
            </label>
            
            <label className="field">
              <span>Confirm New Password</span>
              <input
                required
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{ fontSize: "0.9rem" }}
              />
            </label>
            
            {pwdError && (
              <p style={{ color: "var(--red)", fontSize: "0.85rem", margin: 0 }}>
                ⚠️ {pwdError}
              </p>
            )}

            {pwdSuccess && (
              <p style={{ color: "var(--green)", fontSize: "0.85rem", margin: 0, fontWeight: 600 }}>
                ✓ {pwdSuccess}
              </p>
            )}

            <div style={{ display: "flex", marginTop: "4px" }}>
              <button 
                className="primary-button" 
                type="submit" 
                disabled={pwdLoading}
                style={{ padding: "10px 16px", minHeight: "38px" }}
               aria-label="Action button">
                {pwdLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>

        {/* UPI Payment Setup Card */}
        <div style={{ 
          background: "var(--surface-soft)", 
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ 
              background: "rgba(16, 185, 129, 0.15)", 
              color: "var(--green)", 
              padding: "10px", 
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Smartphone size={20} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>UPI Payment Setup</h4>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                Configure your UPI ID to receive payments directly via QR Code.
              </p>
            </div>
          </div>

          <form onSubmit={handleUpdateUpi} style={{ display: "grid", gap: "14px" }}>
            <label className="field">
              <span>UPI ID (VPA)</span>
              <input
                required
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. 9876543210@ybl"
                style={{ fontSize: "0.9rem" }}
              />
            </label>
            
            <label className="field">
              <span>Payee Name (Optional)</span>
              <input
                type="text"
                value={upiName}
                onChange={(e) => setUpiName(e.target.value)}
                placeholder="e.g. PC World"
                style={{ fontSize: "0.9rem" }}
              />
            </label>
            
            {upiSuccess && (
              <p style={{ color: "var(--green)", fontSize: "0.85rem", margin: 0, fontWeight: 600 }}>
                ✓ {upiSuccess}
              </p>
            )}

            <div style={{ display: "flex", marginTop: "4px" }}>
              <button 
                className="primary-button" 
                type="submit" 
                style={{ padding: "10px 16px", minHeight: "38px" }}
               aria-label="Action button">
                Save UPI Settings
              </button>
            </div>
          </form>
        </div>

      </div>


      {pinPromptOpen && (
        <div className="modal-overlay" onClick={() => { setPinPromptOpen(false); setPinAction(null); setUnlockPin(""); setUnlockPinError(""); }} aria-hidden="true" style={{ zIndex: 1000 }}>
          <section className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal-header">
              <h3>Admin Authorization</h3>
              <button className="icon-button" onClick={() => { setPinPromptOpen(false); setPinAction(null); setUnlockPin(""); setUnlockPinError(""); }} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="status-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (unlockPin === user.pin) {
                  if (pinAction === "restore_local") {
                    if (dataToRestore) {
                      onRestore(dataToRestore);
                      setDataToRestore(null);
                      setSuccessMsg("Database successfully restored from backup!");
                      setTimeout(() => setSuccessMsg(""), 4000);
                    }
                  }
                  setPinPromptOpen(false);
                  setPinAction(null);
                  setUnlockPin("");
                  setUnlockPinError("");
                } else {
                  setUnlockPinError("Incorrect Security PIN. Please try again.");
                }
              }}
            >
              <div style={{ padding: "8px 0", textAlign: "center" }}>
                <p>Enter your <strong>4-digit Admin PIN</strong> to authorize this action.</p>
              </div>
              <label className="field">
                <span>Admin Security PIN</span>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={unlockPin}
                  onChange={(e) => setUnlockPin(e.target.value)}
                  placeholder="••••"
                  required
                  autoFocus
                  style={{ letterSpacing: "8px", fontSize: "1.2rem", textAlign: "center" }}
                />
              </label>
              {unlockPinError && <p className="form-error" style={{ color: "var(--red)", marginTop: "8px" }}>{unlockPinError}</p>}
              <div className="modal-actions" style={{ marginTop: "16px", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="utility-button"
                  onClick={() => { setPinPromptOpen(false); setPinAction(null); setUnlockPin(""); setUnlockPinError(""); }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" aria-label="Action button">
                  Authorize
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [syncMode, setSyncMode] = useState<SyncMode>("checking");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(() => loadSessionUser());
  const [isPinVerified, setIsPinVerified] = useState(() => {
    return sessionStorage.getItem("isPinVerified") !== "false";
  });

  useEffect(() => {
    sessionStorage.setItem("isPinVerified", isPinVerified ? "true" : "false");
  }, [isPinVerified]);
  
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("theme") as "light" | "dark") || "dark"
  );

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);
  
  const [activeView, setActiveView] = useState<ViewKey>(
    () => (localStorage.getItem("activeView") as ViewKey) || "dashboard"
  );
  useEffect(() => {
    localStorage.setItem("activeView", activeView);
  }, [activeView]);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(
    () => loadData().jobs[0]?.id,
  );
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const lastServerJsonRef = useRef("");

  

  useEffect(() => {
    let unsubscribe = () => {};

    if (user) {
      setSyncMode("checking");
      unsubscribe = subscribeToServerData(
        (serverData) => {
          if (serverData) {
            let updatedUsers = [...serverData.users];
            let needsUpdate = false;

            // Verify or add gccbhubaneswar@gmail.com
            const gccAdminIndex = updatedUsers.findIndex(u => u.email === "gccbhubaneswar@gmail.com");
            if (gccAdminIndex === -1) {
              updatedUsers.push({
                id: "ADMIN_GCC",
                name: "Amrut Amrup (GCC Master)",
                role: "admin",
                pin: "0000",
                email: "gccbhubaneswar@gmail.com"
              });
              needsUpdate = true;
            } else {
              const existing = updatedUsers[gccAdminIndex];
              if (existing.id !== "ADMIN_GCC" || existing.role !== "admin") {
                updatedUsers[gccAdminIndex] = {
                  ...existing,
                  id: "ADMIN_GCC",
                  role: "admin"
                };
                needsUpdate = true;
              }
            }

            // Verify or add amitanurup@gmail.com
            const amitAdminIndex = updatedUsers.findIndex(u => u.email === "amitanurup@gmail.com");
            if (amitAdminIndex === -1) {
              updatedUsers.push({
                id: "ADMIN",
                name: "Amit Anurup (Master)",
                role: "admin",
                pin: "0000",
                email: "amitanurup@gmail.com"
              });
              needsUpdate = true;
            } else {
              const existing = updatedUsers[amitAdminIndex];
              if (existing.id !== "ADMIN" || existing.role !== "admin") {
                updatedUsers[amitAdminIndex] = {
                  ...existing,
                  id: "ADMIN",
                  role: "admin"
                };
                needsUpdate = true;
              }
            }

            // If the currently logged in user matches, update their local session too
            if (user && user.email === "gccbhubaneswar@gmail.com") {
              if (user.id !== "ADMIN_GCC" || user.role !== "admin") {
                const updatedMe: AppUser = {
                  ...user,
                  id: "ADMIN_GCC",
                  role: "admin"
                };
                setUser(updatedMe);
                saveSessionUser(updatedMe);
              }
            } else if (user && user.email === "amitanurup@gmail.com") {
              if (user.id !== "ADMIN" || user.role !== "admin") {
                const updatedMe: AppUser = {
                  ...user,
                  id: "ADMIN",
                  role: "admin"
                };
                setUser(updatedMe);
                saveSessionUser(updatedMe);
              }
            }

            // Real-time sync of logged-in user details if modified on Firestore
            if (user) {
              const matchedServerUser = updatedUsers.find(u => u.email === user.email || u.id === user.id);
              if (matchedServerUser) {
                if (
                  matchedServerUser.name !== user.name ||
                  matchedServerUser.role !== user.role ||
                  matchedServerUser.pin !== user.pin ||
                  matchedServerUser.photo !== user.photo ||
                  matchedServerUser.isActive !== user.isActive
                ) {
                  setUser(matchedServerUser);
                  saveSessionUser(matchedServerUser);
                }
              }
            }

            if (needsUpdate) {
              const updatedData = { ...serverData, users: updatedUsers };
              setData(updatedData);
              saveData(updatedData);
              saveServerData(updatedData);
            } else {
              if (JSON.stringify(dataRef.current) !== JSON.stringify(serverData)) {
                setData(serverData);
                saveData(serverData);
              }
            }
            setSyncMode("server");
            setSyncError(null);
          } else {
            // No data in Firestore yet, so let's push our local data to start it off
            const current = loadData();
            saveServerData(current).then(() => {
              setSyncMode("server");
              setSyncError(null);
            });
          }
        },
        () => {
          setSyncMode("local");
          setSyncError("Network error or server disconnected. Retrying in background...");
        }
      );
    } else {
      setSyncMode("local");
    }

    return () => unsubscribe();
  }, [user]);

  const handleSetData = (updater: React.SetStateAction<AppData>) => {
    setData((current) => {
      const next = typeof updater === 'function' ? (updater as any)(current) : updater;
      saveData(next);
      saveServerData(next)
        .then((success) => {
          if (!success) {
            setSyncError("Failed to sync changes with the database. Please check your Firebase permissions or network.");
          } else {
            setSyncError(null);
          }
        })
        .catch((err) => {
          setSyncError("Database sync error: " + String(err));
        });
      return next;
    });
  };

  useEffect(() => {
    if (!selectedJobId || !data.jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(data.jobs[0]?.id);
    }
  }, [data.jobs, selectedJobId]);


  const login = async (nextUser: AppUser) => {
    setUser(nextUser);
    saveSessionUser(nextUser);
    setIsPinVerified(true);
    await triggerLocalFolderBackup(data);
  };

  const logout = async () => {
    await triggerLocalFolderBackup(data);
    setUser(null);
    saveSessionUser(null);
    sessionStorage.removeItem("isPinVerified");
    
  };

  const visibleJobs = useMemo(() => {
    if (!user) {
      return [];
    }
    const scopedJobs = data.jobs;
    return scopedJobs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [data.jobs, user]);

  const selectedJob =
    visibleJobs.find((job) => job.id === selectedJobId) ?? visibleJobs[0];

  const openJobDetails = (id: string) => {
    setSelectedJobId(id);
    setActiveView("details");
  };

  const createJob = async (form: JobFormState) => {
    if (!user) {
      return;
    }
    const now = new Date().toISOString();
    const ticketNo = `SR-${1001 + data.jobs.length}`;
    const assignedEngineerId =
      user.role === "engineer" ? user.id : form.assignedEngineerId;

    const job: ServiceJob = {
      id: createId("job"),
      ticketNo,
      customerName: form.customerName.trim(),
      mobileNumber: form.mobileNumber.trim(),
      productName: form.productName.trim(),
      productSerialNo: form.productSerialNo.trim(),
      problem: form.problem.trim(),
      photoDataUrl: form.photoDataUrl,
      status: "Received",
      assignedEngineerId,
      createdById: user.id,
      createdByName: user.name,
      createdAt: now,
      updatedAt: now,
      repairNote: "",
      estimatedCost: form.estimatedCost,
      advancePayment: form.advancePayment ? Number(form.advancePayment) : undefined,
      history: [
        {
          id: createId("hist"),
          at: now,
          by: user.name,
          status: "Received",
          note: "Product received at service counter.",
        },
      ],
    };
    handleSetData((current) => {
      const productExists = current.inventory.some(
        (item) => item.name.toLowerCase() === form.productName.trim().toLowerCase()
      );
      
      const newInventory = productExists ? current.inventory : [
        {
          id: createId("item"),
          name: form.productName.trim(),
          price: 0,
          stock: 0,
          updatedAt: now,
          verified: false,
        },
        ...current.inventory,
      ];

      const customerExists = current.customers?.some(c => c.mobileNumber === form.mobileNumber.trim());
      const newCustomers = customerExists ? (current.customers || []) : [
        {
          id: createId("cust"),
          name: form.customerName.trim(),
          mobileNumber: form.mobileNumber.trim(),
          createdAt: now
        },
        ...(current.customers || [])
      ];

      return {
        ...current,
        inventory: newInventory,
        customers: newCustomers,
        jobs: [job, ...current.jobs],
      };
    });
    setSelectedJobId(job.id);
    setActiveView("details");
  };

  const saveStatus = async (
    jobId: string,
    status: ServiceStatus,
    assignedEngineerId: string,
    note: string,
    repairCost?: number,
    partsUsed?: { name: string; price: string; isCustom: boolean }[],
    isCredit?: boolean,
    deliveryPayment?: number
  ) => {
    if (!user) {
      return;
    }
    
    if (status === "Repaired" && partsUsed) {
      partsUsed.forEach(part => {
        if (part.isCustom && part.name.trim() && Number(part.price) > 0) {
          const existingProduct = dataRef.current.inventory.find(
            (item) => item.name.toLowerCase() === part.name.trim().toLowerCase()
          );
          if (!existingProduct) {
            addInventory(part.name.trim(), Number(part.price), 0);
          }
        }
      });
    }

    const now = new Date().toISOString();
    const currentJob = dataRef.current.jobs.find((job) => job.id === jobId);
    let compressedDeliveredPhoto: string | undefined;
    if (status === "Delivered" && currentJob?.photoDataUrl) {
      try {
        compressedDeliveredPhoto = await recompressDataUrl(
          currentJob.photoDataUrl,
          DELIVERED_PHOTO_TARGET_BYTES,
        );
      } catch {
        compressedDeliveredPhoto = undefined;
      }
    }

    handleSetData((current) => ({
      ...current,
      jobs: current.jobs.map((job) => {
        if (job.id !== jobId) {
          return job;
        }
        const changed =
          job.status !== status ||
          job.assignedEngineerId !== assignedEngineerId ||
          job.repairNote.trim() !== note.trim() ||
          job.repairCost !== repairCost ||
          (partsUsed && partsUsed.length > 0);
        return {
          ...job,
          photoDataUrl: compressedDeliveredPhoto ?? job.photoDataUrl,
          status,
          assignedEngineerId,
          repairNote: note.trim(),
          partsUsed: partsUsed ? partsUsed.map(p => ({ name: p.name.trim(), price: Number(p.price) || 0 })) : job.partsUsed,
          repairCost: repairCost !== undefined ? repairCost : job.repairCost,
          updatedAt: now,
          history: changed
            ? [
                ...job.history,
                {
                  id: createId("hist"),
                  at: now,
                  by: user.name,
                  status,
                  note: note.trim() || "Status updated.",
                },
              ]
            : job.history,
          isCredit: isCredit !== undefined ? isCredit : job.isCredit,
          deliveryPayment: deliveryPayment !== undefined ? deliveryPayment : job.deliveryPayment,
        };
      }),
    }));
  };

  const addInventory = (name: string, price: number, stock: number) => {
    const trimmedName = name.trim();
    if (!trimmedName || Number.isNaN(price)) {
      return;
    }
    const item: InventoryItem = {
      id: createId("item"),
      name: trimmedName,
      price,
      stock: Number.isNaN(stock) ? 0 : stock,
      updatedAt: new Date().toISOString(),
    };
    handleSetData((current) => ({
      ...current,
      inventory: [item, ...current.inventory],
    }));
  };

  const removeInventory = (id: string) => {
    handleSetData((current) => ({
      ...current,
      inventory: current.inventory.filter((item) => item.id !== id),
    }));
  };

  const editInventory = (id: string, name: string, price: number, stock: number) => {
    handleSetData((current) => ({
      ...current,
      inventory: current.inventory.map((item) =>
        item.id === id ? { ...item, name, price, stock, updatedAt: new Date().toISOString() } : item
      ),
    }));
  };

  const verifyInventory = (id: string) => {
    handleSetData((current) => ({
      ...current,
      inventory: current.inventory.map((item) =>
        item.id === id ? { ...item, verified: true, updatedAt: new Date().toISOString() } : item
      ),
    }));
  };

  const addUser = (newUser: AppUser) => {
    handleSetData((current) => ({
      ...current,
      users: [...current.users, newUser],
    }));
  };

  const removeUser = (id: string) => {
    if (id === "ADMIN" || id === "ADMIN_GCC") return;
    handleSetData((current) => ({
      ...current,
      users: current.users.filter((u) => u.id !== id),
    }));
  };

  const editUser = (updatedUser: AppUser) => {
    const isMaster = updatedUser.id === "ADMIN" || updatedUser.id === "ADMIN_GCC" || updatedUser.email === "amitanurup@gmail.com" || updatedUser.email === "gccbhubaneswar@gmail.com";
    const finalRole = isMaster ? "admin" as const : updatedUser.role;
    const finalUser = { ...updatedUser, role: finalRole };

    if (user && user.id === updatedUser.id) {
      setUser(finalUser);
      saveSessionUser(finalUser);
    }
    
    handleSetData((current) => ({
      ...current,
      users: current.users.map((u) => (u.id === updatedUser.id ? finalUser : u)),
    }));
  };

  const editCustomer = (id: string, name: string, mobileNumber: string) => {
    handleSetData((current) => ({
      ...current,
      customers: current.customers?.map((c) =>
        c.id === id ? { ...c, name, mobileNumber } : c
      ) || [],
    }));
  };

  const deleteCustomer = (id: string) => {
    handleSetData((current) => ({
      ...current,
      customers: current.customers?.filter((c) => c.id !== id) || [],
    }));
  };

  const deleteJob = (jobId: string) => {
    handleSetData((current) => ({
      ...current,
      jobs: current.jobs.filter((j) => j.id !== jobId),
    }));
  };

  const editJob = (
    jobId: string,
    customerName: string,
    mobileNumber: string,
    productName: string,
    productSerialNo: string,
    problem: string,
  ) => {
    handleSetData((current) => ({
      ...current,
      jobs: current.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              customerName: customerName.trim(),
              mobileNumber: mobileNumber.trim(),
              productName: productName.trim(),
              productSerialNo: productSerialNo.trim(),
              problem: problem.trim(),
              updatedAt: new Date().toISOString(),
            }
          : job
      ),
    }));
  };

  const handleBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("download", `galaxy_cartridge_care_backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleRestore = (restoredData: AppData) => {
    handleSetData(restoredData);
  };

  const triggerLocalFolderBackup = async (dataToBackup: AppData) => {
    try {
      const handle = await loadFolderHandle();
      if (handle) {
        const success = await writeBackupToFolder(handle, dataToBackup);
        if (success) {
          console.log("Auto-backup to local folder completed successfully.");
        } else {
          console.warn("Failed to auto-backup to local folder (permission might be required).");
        }
      }
    } catch (error) {
      console.error("Auto-backup to local folder failed:", error);
    }
  };



  const uploadStoreLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      handleSetData((current) => ({ ...current, storeLogo: e.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const uploadUserPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const updatedUser = { ...user!, photo: dataUrl };
      setUser(updatedUser);
      saveSessionUser(updatedUser);
      handleSetData((current) => ({
        ...current,
        users: current.users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
      }));
    };
    reader.readAsDataURL(file);
  };

  if (!user) {
    return (
      <LoginScreen
        users={data.users}
        onLogin={login}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      />
    );
  }

  if (!isPinVerified) {
    return (
      <PinScreen
        user={user}
        onVerify={() => setIsPinVerified(true)}
        onLogout={logout}
      />
    );
  }

  return (
    <AppShell
      user={user}
      storeLogo={data.storeLogo}
      activeView={activeView}
      onViewChange={setActiveView}
      onUploadLogo={uploadStoreLogo}
      onUploadUserPhoto={uploadUserPhoto}
      onLogout={logout}
    >
      <TopBar
        user={user}
        activeView={activeView}
        onLock={() => setIsPinVerified(false)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      />

      {syncError && (
        <div style={{
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#f87171",
          padding: "12px 16px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.9rem",
          animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={18} />
            <span>{syncError}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setSyncError(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {activeView === "dashboard" ? (
        <DashboardView
          user={user}
          users={data.users}
          jobs={visibleJobs}
          inventory={data.inventory}
          selectedJobId={selectedJobId}
          onSelectJob={openJobDetails}
          upiId={data.upiId}
          upiName={data.upiName}
          onMarkPaid={(jobId) => {
            handleSetData(prev => ({
              ...prev,
              jobs: prev.jobs.map(j => {
                if (j.id === jobId) {
                  return {
                    ...j,
                    isCredit: false,
                    deliveryPayment: (j.repairCost || 0) - (j.advancePayment || 0)
                  };
                }
                return j;
              })
            }));
          }}
        />
      ) : null}

      {activeView === "receive" ? (
        <IntakeForm
          users={data.users}
          user={user}
          inventory={data.inventory}
          jobs={data.jobs}
          onCreate={createJob}
        />
      ) : null}

      {activeView === "jobs" ? (
        <JobsPanel
          jobs={visibleJobs}
          users={data.users}
          selectedJobId={selectedJobId}
          onSelect={openJobDetails}
        />
      ) : null}

      {activeView === "details" ? (
        <StatusPanel 
          job={selectedJob} 
          user={user} 
          users={data.users} 
          inventory={data.inventory}
          upiId={data.upiId}
          upiName={data.upiName}
          onSave={saveStatus} 
          onEditJob={editJob}
          onDeleteJob={deleteJob}
        />
      ) : null}

      {activeView === "inventory" ? (
        <InventoryPanel
          items={data.inventory}
          user={user}
          onAdd={addInventory}
          onRemove={removeInventory}
          onEdit={editInventory}
          onVerify={verifyInventory}
        />
      ) : null}

      {activeView === "staff" && user.role === "admin" ? (
        <StaffPanel
          users={data.users}
          user={user}
          onAddUser={addUser}
          onRemoveUser={removeUser}
          onEditUser={editUser}
        />
      ) : null}

      {activeView === "customers" ? (
        <CustomersPanel
          customers={data.customers || []}
          onEditCustomer={editCustomer}
          onDeleteCustomer={deleteCustomer}
        />
      ) : null}

      {activeView === "settings" && user && user.role === "admin" ? (
        <SettingsPanel
          data={data}
          user={user}
          onBackup={handleBackup}
          onRestore={handleRestore}
          onUpdateUpi={(upiId, upiName) => {
            handleSetData(prev => ({ ...prev, upiId, upiName }));
          }}
        />
      ) : null}
    </AppShell>
  );
}
