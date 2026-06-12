import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Bot,
  Boxes,
  ChefHat,
  Edit3,
  Gauge,
  Home,
  LineChart,
  PackageSearch,
  Plus,
  ReceiptText,
  Save,
  Search,
  Settings,
  Sparkles,
  Store,
  Trash2,
  Upload,
  UtensilsCrossed,
  X,
} from "lucide-react";
import "./styles.css";

const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
const departments = ["Kitchen Made", "Bought In", "Bar", "Non-food"];

const initialSuppliers = [
  { id: uid(), name: "Albion Fine Foods", category: "Dry / chilled", contact: "Orders", email: "orders@albion.example", phone: "", active: true },
  { id: uid(), name: "TG Fruits", category: "Produce", contact: "Sales", email: "", phone: "", active: true },
  { id: uid(), name: "Woods", category: "Wholesale", contact: "", email: "", phone: "", active: true },
  { id: uid(), name: "BNFS", category: "Fish", contact: "", email: "", phone: "", active: true },
];

const initialProducts = [
  { id: uid(), name: "Eggs Box x180 Large", supplier: "Cheese Man", packSize: "180 each", quantity: 1, unitCost: 45, department: "Kitchen Made", priceHistory: [{ date: "2026-06-01", price: 45 }] },
  { id: uid(), name: "Chestnut Mushrooms", supplier: "TG Fruits", packSize: "2.25kg", quantity: 1, unitCost: 8.9, department: "Kitchen Made", priceHistory: [{ date: "2026-06-04", price: 8.9 }] },
  { id: uid(), name: "Squish Orange Juice", supplier: "Albion Fine Foods", packSize: "1ltr", quantity: 1, unitCost: 4.69, department: "Bar", priceHistory: [{ date: "2026-06-07", price: 4.69 }] },
  { id: uid(), name: "Croissant", supplier: "Coburn & Baker", packSize: "each", quantity: 1, unitCost: 1.16, department: "Bought In", priceHistory: [{ date: "2026-06-08", price: 1.16 }] },
];

const initialInvoices = [
  {
    id: uid(),
    invoiceNumber: "11676921",
    supplier: "Albion Fine Foods",
    date: "2026-06-07",
    status: "Approved",
    items: [
      { id: uid(), productName: "Squish Orange Juice", packSize: "1ltr", quantity: 3, unitCost: 4.69, supplier: "Albion Fine Foods", department: "Bar" },
      { id: uid(), productName: "Semi-Skimmed Milk", packSize: "2ltr", quantity: 2, unitCost: 1.29, supplier: "Albion Fine Foods", department: "Kitchen Made" },
    ],
  },
  {
    id: uid(),
    invoiceNumber: "807893",
    supplier: "TG Fruits",
    date: "2026-06-08",
    status: "Approved",
    items: [
      { id: uid(), productName: "Chestnut Mushrooms", packSize: "2.25kg", quantity: 4, unitCost: 8.9, supplier: "TG Fruits", department: "Kitchen Made" },
      { id: uid(), productName: "Lemons", packSize: "per kg", quantity: 3, unitCost: 1.96, supplier: "TG Fruits", department: "Kitchen Made" },
    ],
  },
];

const initialSales = [
  { day: "Mon", date: "2026-06-01", sales: 1321.55 },
  { day: "Tue", date: "2026-06-02", sales: 817.35 },
  { day: "Wed", date: "2026-06-03", sales: 672.25 },
  { day: "Thu", date: "2026-06-04", sales: 1480.35 },
  { day: "Fri", date: "2026-06-05", sales: 3348.5 },
  { day: "Sat", date: "2026-06-06", sales: 3212.25 },
  { day: "Sun", date: "2026-06-07", sales: 1035.79 },
];

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "invoices", label: "Invoices", icon: ReceiptText },
  { id: "products", label: "Products", icon: PackageSearch },
  { id: "suppliers", label: "Suppliers", icon: Store },
  { id: "stocktake", label: "Stocktake", icon: Boxes },
  { id: "recipes", label: "Recipes", icon: ChefHat },
  { id: "menu", label: "Menu Costing", icon: UtensilsCrossed },
  { id: "waste", label: "Waste", icon: Trash2 },
  { id: "gp", label: "GP Analysis", icon: Gauge },
  { id: "ai", label: "AI Insights", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value) || 0);
}

function percent(value) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function lineTotal(item) {
  return (Number(item.quantity) || 0) * (Number(item.unitCost) || 0);
}

function invoiceTotal(invoice) {
  return (invoice.items || []).reduce((sum, item) => sum + lineTotal(item), 0);
}

function supplierFromFile(name) {
  const lower = name.toLowerCase();
  if (lower.includes("albion")) return "Albion Fine Foods";
  if (lower.includes("tg") || lower.includes("fruit")) return "TG Fruits";
  if (lower.includes("woods")) return "Woods";
  if (lower.includes("bnfs") || lower.includes("fish")) return "BNFS";
  if (lower.includes("coburn")) return "Coburn & Baker";
  return "Unknown Supplier";
}

function mockExtractLines(file, supplier) {
  const presets = {
    "Albion Fine Foods": [
      ["Oat Milk Barista", "1ltr", 6, 2.83, "Bar"],
      ["Squish Orange Juice", "1ltr", 3, 4.69, "Bar"],
      ["Semi-Skimmed Milk", "2ltr", 2, 1.29, "Kitchen Made"],
    ],
    "TG Fruits": [
      ["Chestnut Mushrooms", "2.25kg", 4, 8.9, "Kitchen Made"],
      ["Lemons", "per kg", 3, 1.96, "Kitchen Made"],
      ["Portobello Mushrooms", "1.5kg", 2, 6.9, "Kitchen Made"],
    ],
    Woods: [
      ["Mixed Chilli Nuts Luxury", "1kg", 1, 13.02, "Bought In"],
      ["Blue Roll", "case", 1, 17.2, "Non-food"],
    ],
    BNFS: [
      ["Smoked Salmon Side", "kg", 2.91, 26.04, "Kitchen Made"],
      ["Cod Fillet", "kg", 2, 17.85, "Kitchen Made"],
    ],
  };
  return (presets[supplier] || [["New Product", "", 1, 0, "Kitchen Made"]]).map(([productName, packSize, quantity, unitCost, department]) => ({
    id: uid(),
    productName,
    packSize,
    quantity,
    unitCost,
    supplier,
    department,
    source: file.name,
  }));
}

function App() {
  const [active, setActive] = useState("dashboard");
  const [department, setDepartment] = useState("Kitchen Made");
  const [products, setProducts] = useState(initialProducts);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [sales, setSales] = useState(initialSales);
  const [draft, setDraft] = useState({ files: [], items: [], supplier: "", date: today(), invoiceNumber: "", status: "Idle" });

  const metrics = useMemo(() => calculateMetrics(invoices, sales, department), [invoices, sales, department]);
  const supplierSpend = useMemo(() => spendBySupplier(invoices, suppliers), [invoices, suppliers]);
  const ActiveIcon = navItems.find((item) => item.id === active)?.icon || Home;

  const approveInvoice = () => {
    if (!draft.items.length) return;
    const supplier = draft.supplier || draft.items[0]?.supplier || "Unknown Supplier";
    const invoice = {
      id: uid(),
      invoiceNumber: draft.invoiceNumber || `MF-${String(invoices.length + 1).padStart(4, "0")}`,
      supplier,
      date: draft.date || today(),
      status: "Approved",
      items: draft.items,
    };
    setInvoices((current) => [invoice, ...current]);
    setSuppliers((current) => ensureSupplierList(current, supplier));
    setProducts((current) => mergeInvoiceProducts(current, draft.items, invoice.date));
    setDraft({ files: [], items: [], supplier: "", date: today(), invoiceNumber: "", status: "Idle" });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MF</div>
          <div>
            <strong>MarginFlow</strong>
            <span>F&B profit management</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={active === item.id ? "active" : ""} key={item.id} onClick={() => setActive(item.id)} type="button">
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-card">
          <Sparkles size={18} />
          <strong>AI architecture ready</strong>
          <p>Frontend calls a backend endpoint. The OpenAI key never belongs in the browser.</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MarginFlow v2</p>
            <h1>{navItems.find((item) => item.id === active)?.label}</h1>
            <p>Turn invoices, stock, recipes and sales into restaurant profit insight.</p>
          </div>
          <div className="top-actions">
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {departments.slice(0, 3).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </header>

        <section className="view-title">
          <ActiveIcon size={20} />
          <span>Viewing {department}</span>
        </section>

        {active === "dashboard" && <Dashboard metrics={metrics} supplierSpend={supplierSpend} invoices={invoices} />}
        {active === "invoices" && (
          <Invoices
            draft={draft}
            setDraft={setDraft}
            invoices={invoices}
            suppliers={suppliers}
            approveInvoice={approveInvoice}
            setInvoices={setInvoices}
          />
        )}
        {active === "products" && <Products products={products} setProducts={setProducts} suppliers={suppliers} />}
        {active === "suppliers" && <Suppliers suppliers={suppliers} setSuppliers={setSuppliers} supplierSpend={supplierSpend} />}
        {active === "stocktake" && <Stocktake products={products} />}
        {active === "recipes" && <Recipes products={products} />}
        {active === "menu" && <MenuCosting />}
        {active === "waste" && <Waste />}
        {active === "gp" && <GpAnalysis metrics={metrics} invoices={invoices} supplierSpend={supplierSpend} />}
        {active === "ai" && <AiInsights metrics={metrics} products={products} supplierSpend={supplierSpend} />}
        {active === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}

function calculateMetrics(invoices, sales, department) {
  const salesTotal = sales.reduce((sum, row) => sum + row.sales, 0);
  const purchases = invoices.reduce(
    (sum, invoice) => sum + invoice.items.filter((item) => item.department === department).reduce((lineSum, item) => lineSum + lineTotal(item), 0),
    0
  );
  const allPurchases = invoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  return {
    sales: salesTotal,
    purchases,
    allPurchases,
    invoiceGp: salesTotal ? ((salesTotal - purchases) / salesTotal) * 100 : 0,
    realGp: 69.7,
    waste: 34.74,
    salesRows: sales,
  };
}

function spendBySupplier(invoices, suppliers) {
  return suppliers.map((supplier) => {
    const spend = invoices
      .filter((invoice) => invoice.supplier === supplier.name)
      .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
    return { ...supplier, spend };
  });
}

function ensureSupplierList(suppliers, name) {
  if (suppliers.some((supplier) => supplier.name.toLowerCase() === name.toLowerCase())) return suppliers;
  return [...suppliers, { id: uid(), name, category: "New supplier", contact: "", email: "", phone: "", active: true }];
}

function mergeInvoiceProducts(products, items, invoiceDate) {
  const next = [...products];
  items.forEach((item) => {
    const index = next.findIndex((product) => product.name.toLowerCase() === item.productName.toLowerCase() && product.supplier === item.supplier);
    const historyEntry = { date: invoiceDate, price: Number(item.unitCost) || 0 };
    if (index >= 0) {
      next[index] = {
        ...next[index],
        packSize: item.packSize,
        quantity: item.quantity,
        unitCost: Number(item.unitCost) || 0,
        department: item.department,
        priceHistory: [...(next[index].priceHistory || []), historyEntry],
      };
    } else {
      next.push({
        id: uid(),
        name: item.productName,
        supplier: item.supplier,
        packSize: item.packSize,
        quantity: item.quantity,
        unitCost: Number(item.unitCost) || 0,
        department: item.department,
        priceHistory: [historyEntry],
      });
    }
  });
  return next;
}

function Dashboard({ metrics, supplierSpend, invoices }) {
  return (
    <>
      <div className="metric-grid">
        <Metric label="Net sales" value={money(metrics.sales)} delta="Current week" />
        <Metric label="Invoice spend" value={money(metrics.purchases)} delta="Selected department" />
        <Metric label="Invoice GP" value={percent(metrics.invoiceGp)} delta="Before stocktake" />
        <Metric label="Real GP" value={percent(metrics.realGp)} delta="With stocktake" />
        <Metric label="Waste cost" value={money(metrics.waste)} delta="This month" tone="warn" />
      </div>
      <div className="dashboard-layout">
        <Panel title="Weekly profit flow" action="Thin bar chart">
          <BarSeries rows={metrics.salesRows} valueKey="sales" />
        </Panel>
        <Panel title="Supplier spend">
          <DonutBars rows={supplierSpend} />
        </Panel>
      </div>
      <div className="dashboard-layout secondary">
        <Panel title="Recent invoices">
          <DataTable
            columns={[
              { key: "invoiceNumber", label: "Invoice" },
              { key: "supplier", label: "Supplier" },
              { key: "date", label: "Date" },
              { key: "total", label: "Total", render: (_, row) => money(invoiceTotal(row)) },
            ]}
            rows={invoices}
          />
        </Panel>
        <Panel title="Cost alerts">
          <InsightList />
        </Panel>
      </div>
    </>
  );
}

function Invoices({ draft, setDraft, invoices, suppliers, approveInvoice, setInvoices }) {
  const [dragging, setDragging] = useState(false);

  const addFiles = (files) => {
    const uploaded = Array.from(files || []);
    if (!uploaded.length) return;
    setDraft((current) => ({ ...current, files: [...current.files, ...uploaded], status: `${uploaded.length} file(s) uploaded` }));
  };

  const readInvoice = () => {
    if (!draft.files.length) return;
    const file = draft.files[0];
    const supplier = draft.supplier || supplierFromFile(file.name);
    setDraft((current) => ({
      ...current,
      supplier,
      invoiceNumber: current.invoiceNumber || file.name.replace(/\.[^.]+$/, "").slice(0, 20),
      date: current.date || today(),
      items: mockExtractLines(file, supplier),
      status: "Review extracted items",
    }));
  };

  const updateDraftItem = (id, field, value) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, [field]: field === "quantity" || field === "unitCost" ? Number(value) : value } : item)),
    }));
  };

  const addManualLine = () => {
    const supplier = draft.supplier || "Unknown Supplier";
    setDraft((current) => ({
      ...current,
      supplier,
      items: [
        ...current.items,
        { id: uid(), productName: "New Product", packSize: "", quantity: 1, unitCost: 0, supplier, department: "Kitchen Made" },
      ],
      status: "Manual review",
    }));
  };

  return (
    <div className="page-grid">
      <Panel title="Invoice workflow" action={draft.status}>
        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <Upload size={30} />
          <h3>Upload invoice PDF or image</h3>
          <p>Drag and drop files here, or choose a file. Extracted lines stay in review until approved.</p>
          <label className="file-button">
            Choose invoice
            <input accept="image/*,.pdf" multiple onChange={(event) => addFiles(event.target.files)} type="file" />
          </label>
        </div>
        <div className="invoice-meta">
          <label>Supplier<select value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })}>
            <option value="">Auto detect</option>
            {suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}
          </select></label>
          <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
          <label>Invoice number<input value={draft.invoiceNumber} onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })} /></label>
        </div>
        <div className="file-list">
          {draft.files.map((file, index) => (
            <span key={`${file.name}-${index}`}>{file.name}<button onClick={() => setDraft({ ...draft, files: draft.files.filter((_, itemIndex) => itemIndex !== index) })} type="button"><X size={14} /></button></span>
          ))}
        </div>
        <div className="button-row left">
          <button onClick={readInvoice} type="button">Read Invoice</button>
          <button className="ghost" onClick={addManualLine} type="button">Add Manual Line</button>
          <button disabled={!draft.items.length} onClick={approveInvoice} type="button"><Save size={16} />Confirm Invoice</button>
        </div>
      </Panel>

      <Panel title="Review extracted items" action={`${draft.items.length} line(s)`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["Product", "Pack size", "Quantity", "Unit cost", "Supplier", "Department", "Line total", ""].map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {draft.items.map((item) => (
                <tr key={item.id}>
                  <td><input value={item.productName} onChange={(event) => updateDraftItem(item.id, "productName", event.target.value)} /></td>
                  <td><input value={item.packSize} onChange={(event) => updateDraftItem(item.id, "packSize", event.target.value)} /></td>
                  <td><input min="0" step="0.01" type="number" value={item.quantity} onChange={(event) => updateDraftItem(item.id, "quantity", event.target.value)} /></td>
                  <td><input min="0" step="0.01" type="number" value={item.unitCost} onChange={(event) => updateDraftItem(item.id, "unitCost", event.target.value)} /></td>
                  <td><input value={item.supplier} onChange={(event) => updateDraftItem(item.id, "supplier", event.target.value)} /></td>
                  <td><select value={item.department} onChange={(event) => updateDraftItem(item.id, "department", event.target.value)}>{departments.map((dept) => <option key={dept}>{dept}</option>)}</select></td>
                  <td>{money(lineTotal(item))}</td>
                  <td><button className="icon danger" onClick={() => setDraft({ ...draft, items: draft.items.filter((line) => line.id !== item.id) })} type="button"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Approved invoices">
        <DataTable
          columns={[
            { key: "invoiceNumber", label: "Invoice" },
            { key: "supplier", label: "Supplier" },
            { key: "date", label: "Date" },
            { key: "items", label: "Lines", render: (items) => items.length },
            { key: "total", label: "Total", render: (_, row) => money(invoiceTotal(row)) },
            { key: "status", label: "Status", render: (value) => <Badge tone="green">{value}</Badge> },
          ]}
          onDelete={(id) => setInvoices((current) => current.filter((invoice) => invoice.id !== id))}
          rows={invoices}
        />
      </Panel>
    </div>
  );
}

function Products({ products, setProducts, suppliers }) {
  const empty = { name: "", supplier: suppliers[0]?.name || "", packSize: "", quantity: 1, unitCost: 0, department: "Kitchen Made" };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");

  const saveProduct = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      setProducts((current) => current.map((product) => (product.id === editingId ? { ...product, ...form, unitCost: Number(form.unitCost), quantity: Number(form.quantity) } : product)));
    } else {
      setProducts((current) => [...current, { ...form, id: uid(), unitCost: Number(form.unitCost), quantity: Number(form.quantity), priceHistory: [{ date: today(), price: Number(form.unitCost) }] }]);
    }
    setForm(empty);
    setEditingId("");
  };

  return (
    <div className="page-grid">
      <Panel title={editingId ? "Edit product" : "Add product"}>
        <div className="form-grid six">
          <Field label="Product" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <label>Supplier<select value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })}>{suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</select></label>
          <Field label="Pack size" value={form.packSize} onChange={(value) => setForm({ ...form, packSize: value })} />
          <Field label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
          <Field label="Unit cost" type="number" value={form.unitCost} onChange={(value) => setForm({ ...form, unitCost: value })} />
          <label>Department<select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>{departments.map((dept) => <option key={dept}>{dept}</option>)}</select></label>
        </div>
        <div className="button-row left"><button onClick={saveProduct} type="button"><Plus size={16} />{editingId ? "Save Product" : "Add Product"}</button></div>
      </Panel>
      <Panel title="Product database" action="CRUD + price history">
        <DataTable
          columns={[
            { key: "name", label: "Product" },
            { key: "supplier", label: "Supplier" },
            { key: "packSize", label: "Pack" },
            { key: "quantity", label: "Qty" },
            { key: "unitCost", label: "Unit cost", render: (value) => money(value) },
            { key: "department", label: "Department" },
            { key: "priceHistory", label: "Price history", render: (history) => `${history?.length || 0} entries` },
          ]}
          onDelete={(id) => setProducts((current) => current.filter((product) => product.id !== id))}
          onEdit={(row) => {
            setForm(row);
            setEditingId(row.id);
          }}
          rows={products}
        />
      </Panel>
    </div>
  );
}

function Suppliers({ suppliers, setSuppliers, supplierSpend }) {
  const empty = { name: "", category: "", contact: "", email: "", phone: "", active: true };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState("");

  const saveSupplier = () => {
    if (!form.name.trim()) return;
    if (editingId) setSuppliers((current) => current.map((supplier) => (supplier.id === editingId ? { ...supplier, ...form } : supplier)));
    else setSuppliers((current) => [...current, { ...form, id: uid() }]);
    setForm(empty);
    setEditingId("");
  };

  return (
    <div className="page-grid">
      <Panel title={editingId ? "Edit supplier" : "Add supplier"}>
        <div className="form-grid six">
          <Field label="Supplier" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
          <Field label="Contact" value={form.contact} onChange={(value) => setForm({ ...form, contact: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <label>Status<select value={form.active ? "Active" : "Inactive"} onChange={(event) => setForm({ ...form, active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
        </div>
        <div className="button-row left"><button onClick={saveSupplier} type="button"><Plus size={16} />{editingId ? "Save Supplier" : "Add Supplier"}</button></div>
      </Panel>
      <Panel title="Supplier directory" action="Spend totals">
        <DataTable
          columns={[
            { key: "name", label: "Supplier" },
            { key: "category", label: "Category" },
            { key: "contact", label: "Contact" },
            { key: "email", label: "Email" },
            { key: "spend", label: "Spend", render: (value) => money(value) },
            { key: "active", label: "Status", render: (value) => <Badge tone={value ? "green" : "amber"}>{value ? "Active" : "Inactive"}</Badge> },
          ]}
          onDelete={(id) => setSuppliers((current) => current.filter((supplier) => supplier.id !== id))}
          onEdit={(row) => {
            setForm(row);
            setEditingId(row.id);
          }}
          rows={supplierSpend}
        />
      </Panel>
    </div>
  );
}

function Stocktake({ products }) {
  return (
    <Panel title="Stocktake control" action="Manual or CSV ready">
      <div className="metric-grid compact">
        <Metric label="Opening stock" value="£3,796.31" delta="13 Apr" />
        <Metric label="Closing stock" value="£4,000.00" delta="09 Jun" />
        <Metric label="Real cost used" value="£3,593.69" delta="Opening + purchases - closing" />
      </div>
      <DataTable
        columns={[
          { key: "name", label: "Product" },
          { key: "packSize", label: "Pack" },
          { key: "quantity", label: "Expected" },
          { key: "unitCost", label: "Latest cost", render: (value) => money(value) },
          { key: "value", label: "Stock value", render: (_, row) => money(row.quantity * row.unitCost) },
        ]}
        rows={products}
      />
    </Panel>
  );
}

function Recipes({ products }) {
  const rows = [
    { id: "r1", name: "Chilli Jam", yield: "5kg", cost: 12.5, unit: "£2.50/kg", linked: 4 },
    { id: "r2", name: "Whipped Feta", yield: "2.5kg", cost: 18.8, unit: "£7.52/kg", linked: 7 },
  ];
  return (
    <Panel title="Recipe costing" action={`${products.length} product ingredients available`}>
      <DataTable
        columns={[
          { key: "name", label: "Recipe" },
          { key: "yield", label: "Yield" },
          { key: "cost", label: "Batch cost", render: (value) => money(value) },
          { key: "unit", label: "Unit cost" },
          { key: "linked", label: "Menu links" },
        ]}
        rows={rows}
      />
    </Panel>
  );
}

function MenuCosting() {
  const rows = [
    { id: "m1", dish: "Bacon & Egg Muffin", menu: "Breakfast", cost: 1.5, price: 9.5, gp: 84.2 },
    { id: "m2", dish: "Mushrooms on Toast", menu: "Brunch", cost: 1.72, price: 11.5, gp: 85 },
    { id: "m3", dish: "Hake", menu: "Evening", cost: 5.85, price: 24, gp: 75.6 },
  ];
  return <Panel title="Menu costing"><DataTable columns={[{ key: "dish", label: "Dish" }, { key: "menu", label: "Menu" }, { key: "cost", label: "Cost", render: money }, { key: "price", label: "Price", render: money }, { key: "gp", label: "GP", render: percent }]} rows={rows} /></Panel>;
}

function Waste() {
  const rows = [
    { id: "w1", date: "2026-06-08", item: "Hake garnish", reason: "Overproduction", department: "Kitchen Made", cost: 18.4 },
    { id: "w2", date: "2026-06-08", item: "Orange juice", reason: "FOH mistake", department: "Bar", cost: 9.38 },
    { id: "w3", date: "2026-06-07", item: "Croissant", reason: "Spoiled", department: "Bought In", cost: 6.96 },
  ];
  return <Panel title="Waste tracking" action="Reporting only"><DataTable columns={[{ key: "date", label: "Date" }, { key: "item", label: "Item" }, { key: "reason", label: "Reason" }, { key: "department", label: "Department" }, { key: "cost", label: "Cost", render: money }]} rows={rows} /></Panel>;
}

function GpAnalysis({ metrics, invoices, supplierSpend }) {
  const costIncreaseRows = invoices.flatMap((invoice) => invoice.items).map((item) => ({ id: item.id, name: item.productName, supplier: item.supplier, increase: item.unitCost > 5 ? 12.4 : 4.2, cost: item.unitCost }));
  return (
    <>
      <div className="metric-grid">
        <Metric label="Kitchen Made GP" value={percent(metrics.invoiceGp)} delta="Invoice GP" />
        <Metric label="Spend trend" value={money(metrics.purchases)} delta="Week selected" />
        <Metric label="Real GP" value={percent(metrics.realGp)} delta="Stocktake" />
        <Metric label="Top supplier" value={supplierSpend.sort((a, b) => b.spend - a.spend)[0]?.name || "-"} delta="By spend" />
      </div>
      <div className="dashboard-layout secondary">
        <Panel title="GP trend chart"><LineSeries rows={metrics.salesRows} valueKey="sales" /></Panel>
        <Panel title="Spend trend chart"><BarSeries rows={metrics.salesRows.map((row) => ({ ...row, purchases: row.sales * 0.31 }))} valueKey="purchases" /></Panel>
      </div>
      <div className="dashboard-layout secondary">
        <Panel title="Supplier spend chart"><DonutBars rows={supplierSpend} /></Panel>
        <Panel title="Top cost increases"><DataTable columns={[{ key: "name", label: "Product" }, { key: "supplier", label: "Supplier" }, { key: "cost", label: "Cost", render: money }, { key: "increase", label: "Increase", render: percent }]} rows={costIncreaseRows} /></Panel>
      </div>
    </>
  );
}

function AiInsights({ metrics, products, supplierSpend }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask MarginFlow AI about GP drops, supplier cost, price increases, or menu pricing. Mock answers are used until the backend is connected to OpenAI." },
  ]);

  const ask = async (preset = question) => {
    if (!preset.trim()) return;
    const prompt = preset.trim();
    setMessages((current) => [...current, { role: "user", text: prompt }]);
    setQuestion("");
    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, context: { metrics, products, supplierSpend } }),
      });
      if (!response.ok) throw new Error("Backend unavailable");
      const payload = await response.json();
      setMessages((current) => [...current, { role: "assistant", text: payload.answer }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: mockAiAnswer(prompt, metrics, products, supplierSpend) }]);
    }
  };

  return (
    <div className="ai-layout">
      <Panel title="Ask MarginFlow AI" action="Mock mode">
        <div className="prompt-row">
          <input placeholder="Ask why GP dropped..." value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && ask()} />
          <button onClick={() => ask()} type="button"><Bot size={16} />Ask</button>
        </div>
        <div className="quick-prompts">
          {["Why did GP drop?", "Which products increased most?", "Which supplier costs most?", "What should I increase prices on?"].map((item) => <button className="ghost" key={item} onClick={() => ask(item)} type="button">{item}</button>)}
        </div>
        <div className="chat-panel">
          {messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}
        </div>
      </Panel>
      <Panel title="AI backend structure">
        <div className="code-card">
          <p>Frontend calls <code>POST /api/ai/ask</code>.</p>
          <p>The backend owns <code>OPENAI_API_KEY</code>. The browser never receives it.</p>
          <p>Use the included <code>server.js</code> as the integration point.</p>
        </div>
      </Panel>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="settings-grid">
      <Panel title="Restaurant setup">
        <div className="form-grid">
          <Field label="Restaurant name" value="Reading Room" readOnly />
          <label>Currency<select defaultValue="GBP"><option>GBP</option><option>EUR</option><option>USD</option></select></label>
          <Field label="Target GP" value="75%" readOnly />
          <label>Week starts<select defaultValue="Monday"><option>Monday</option><option>Sunday</option></select></label>
        </div>
      </Panel>
      <Panel title="Departments">
        <DataTable columns={[{ key: "department", label: "Department" }, { key: "base", label: "GP base" }, { key: "target", label: "Target" }]} rows={departments.map((department) => ({ id: department, department, base: department === "Non-food" ? "Excluded" : department, target: department === "Non-food" ? "-" : "75%" }))} />
      </Panel>
    </div>
  );
}

function DataTable({ columns, rows, onEdit, onDelete }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: columns[0]?.key || "", dir: "asc" });
  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return [...rows]
      .filter((row) => JSON.stringify(row).toLowerCase().includes(lower))
      .sort((a, b) => {
        const av = String(a[sort.key] ?? "");
        const bv = String(b[sort.key] ?? "");
        return sort.dir === "asc" ? av.localeCompare(bv, undefined, { numeric: true }) : bv.localeCompare(av, undefined, { numeric: true });
      });
  }, [rows, query, sort]);

  const toggleSort = (key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));

  return (
    <>
      <div className="table-toolbar">
        <label><Search size={15} /><input placeholder="Search..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}><button className="sort-button" onClick={() => toggleSort(column.key)} type="button">{column.label}<ArrowDownUp size={13} /></button></th>
              ))}
              {(onEdit || onDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>)}
                {(onEdit || onDelete) && (
                  <td>
                    <div className="row-actions">
                      {onEdit && <button className="icon" onClick={() => onEdit(row)} type="button"><Edit3 size={15} /></button>}
                      {onDelete && <button className="icon danger" onClick={() => onDelete(row.id)} type="button"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Field({ label, value, onChange, type = "text", readOnly = false }) {
  return <label>{label}<input readOnly={readOnly} type={type} value={value} onChange={(event) => onChange?.(event.target.value)} /></label>;
}

function Metric({ label, value, delta, tone = "default" }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action && <span>{action}</span>}
      </div>
      {children}
    </section>
  );
}

function BarSeries({ rows, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  return (
    <div className="bar-series thin">
      {rows.map((row) => (
        <div className="bar-column" key={row.day}>
          <div className="bar-track"><div className="bar-fill" style={{ height: `${((Number(row[valueKey]) || 0) / max) * 100}%` }} /></div>
          <span>{row.day}</span>
        </div>
      ))}
    </div>
  );
}

function LineSeries({ rows, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  const points = rows.map((row, index) => `${(index / (rows.length - 1)) * 100},${100 - ((Number(row[valueKey]) || 0) / max) * 88}`).join(" ");
  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={points} />
      </svg>
      <div className="chart-labels">{rows.map((row) => <span key={row.day}>{row.day}</span>)}</div>
    </div>
  );
}

function DonutBars({ rows }) {
  const max = Math.max(...rows.map((row) => row.spend), 1);
  return <div className="donut-list">{rows.map((row) => <div key={row.id || row.name}><span>{row.name}</span><strong>{money(row.spend)}</strong><i style={{ width: `${(row.spend / max) * 100}%` }} /></div>)}</div>;
}

function InsightList() {
  return (
    <div className="stack-list">
      <Opportunity title="Kitchen GP below target" body="Wednesday has purchases higher than net sales. Check invoice timing or stock usage." />
      <Opportunity title="Supplier movement" body="Albion and Woods are driving most of the current spend." />
      <Opportunity title="Menu pricing" body="Review low-GP dishes and compare selling price against target GP." />
    </div>
  );
}

function Opportunity({ title, body }) {
  return <div className="opportunity"><div><AlertTriangle size={18} /></div><article><strong>{title}</strong><p>{body}</p></article></div>;
}

function Badge({ children, tone }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function mockAiAnswer(question, metrics, products, supplierSpend) {
  const lower = question.toLowerCase();
  if (lower.includes("supplier")) {
    const top = [...supplierSpend].sort((a, b) => b.spend - a.spend)[0];
    return `${top?.name || "No supplier"} is currently the highest-cost supplier at ${money(top?.spend || 0)}. Review high-value invoice lines before the next order.`;
  }
  if (lower.includes("product") || lower.includes("increased")) {
    const top = [...products].sort((a, b) => b.unitCost - a.unitCost)[0];
    return `${top?.name || "No product"} is one of the highest-cost products at ${money(top?.unitCost || 0)}. Check its latest invoice against previous price history.`;
  }
  if (lower.includes("price")) {
    return "Start with dishes below 75% GP or dishes using products that recently increased. Increase selling price only where volume and guest perception can support it.";
  }
  return `GP is currently ${percent(metrics.invoiceGp)} before stocktake. The usual causes of a GP drop are higher invoice spend, missing sales split, waste, or stock timing.`;
}

createRoot(document.getElementById("root")).render(<App />);
