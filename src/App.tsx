import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, setAuthToken } from './services/api';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { LeadsView } from './components/LeadsView';
import { ProjectsPropertiesView } from './components/ProjectsPropertiesView';
import { WhatsAppAiView } from './components/WhatsAppAiView';
import { OperationsView } from './components/OperationsView';
import { BillingReceiptsView } from './components/BillingReceiptsView';
import { ComplianceMarketingView } from './components/ComplianceMarketingView';
import { SecurityDocsView } from './components/SecurityDocsView';
import type {
  AdvanceTokenReceiptRecord,
  BookingRecord,
  CampaignRecord,
  CommissionRecord,
  ConsentRecord,
  CustomerRecord,
  FollowUpRecord,
  InvoiceRecord,
  LeadRecord,
  PaymentRecord,
  ProjectRecord,
  PropertyRecord,
  SiteVisitRecord,
  UserRecord,
} from './types';

type NavKey =
  | 'dashboard'
  | 'leads'
  | 'inventory'
  | 'whatsapp'
  | 'operations'
  | 'billing'
  | 'compliance'
  | 'security';

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
  { key: 'leads', label: 'Leads & Pipeline', icon: Users },
  { key: 'inventory', label: 'Projects & Properties', icon: Building2 },
  { key: 'whatsapp', label: 'WhatsApp & AI Bot', icon: MessageSquare },
  { key: 'operations', label: 'Visits, Bookings & INR', icon: CalendarCheck },
  { key: 'billing', label: 'Billing & Token Receipts', icon: Receipt },
  { key: 'compliance', label: 'Customers & Consent', icon: ShieldCheck },
  { key: 'security', label: 'Sample SQL, Security & Docs', icon: Database },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [employees, setEmployees] = useState<UserRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [consent, setConsent] = useState<ConsentRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [siteVisits, setSiteVisits] = useState<SiteVisitRecord[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [tokenReceipts, setTokenReceipts] = useState<AdvanceTokenReceiptRecord[]>([]);
  const [initialBookingLeadId, setInitialBookingLeadId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    if (!currentUser) return;
    setLoadError(null);
    try {
      const [
        projData,
        propData,
        leadData,
        empData,
        custData,
        consentData,
        cmpData,
        visitData,
        fuData,
        bkData,
        payData,
        comData,
        invData,
        tokData,
      ] = await Promise.all([
        apiFetch<ProjectRecord[]>('/api/projects'),
        apiFetch<PropertyRecord[]>('/api/properties'),
        apiFetch<LeadRecord[]>('/api/leads'),
        apiFetch<UserRecord[]>('/api/employees'),
        apiFetch<CustomerRecord[]>('/api/customers'),
        apiFetch<ConsentRecord[]>('/api/consent'),
        apiFetch<CampaignRecord[]>('/api/campaigns'),
        apiFetch<SiteVisitRecord[]>('/api/site-visits'),
        apiFetch<FollowUpRecord[]>('/api/follow-ups'),
        apiFetch<BookingRecord[]>('/api/bookings'),
        apiFetch<PaymentRecord[]>('/api/payments'),
        apiFetch<CommissionRecord[]>('/api/commissions'),
        apiFetch<InvoiceRecord[]>('/api/invoices'),
        apiFetch<AdvanceTokenReceiptRecord[]>('/api/token-receipts'),
      ]);
      setProjects(projData);
      setProperties(propData);
      setLeads(leadData);
      setEmployees(empData);
      setCustomers(custData);
      setConsent(consentData);
      setCampaigns(cmpData);
      setSiteVisits(visitData);
      setFollowUps(fuData);
      setBookings(bkData);
      setPayments(payData);
      setCommissions(comData);
      setInvoices(invData);
      setTokenReceipts(tokData);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to synchronize CRM workspace.');
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadWorkspaceData();
    }
  }, [currentUser, loadWorkspaceData]);

  function handleLogout() {
    setAuthToken(null);
    setCurrentUser(null);
    setActiveNav('dashboard');
  }

  if (!currentUser) {
    return (
      <LoginView
        onAuthenticated={(user) => {
          setCurrentUser(user);
        }}
      />
    );
  }

  const activeLabel = NAV_ITEMS.find((n) => n.key === activeNav)?.label || 'Workspace';
  const istNow = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0B1F3A] text-white">
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-base font-bold tracking-tight whitespace-nowrap">
              Avasa Realty CRM
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">India · INR (₹) · IST</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveNav(item.key)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2.5">
          <div>
            <div className="text-xs font-semibold text-white truncate">{currentUser.fullName}</div>
            <div className="text-[11px] text-emerald-300 mt-0.5">{currentUser.roleName}</div>
          </div>
          <div>
            <label htmlFor="demo-role-switch" className="block text-[10px] text-slate-400 mb-1">
              Switch Demo Role
            </label>
            <select
              id="demo-role-switch"
              value={currentUser.email}
              onChange={async (e) => {
                const res = await apiFetch<{ token: string; user: UserRecord }>('/api/auth/login', {
                  method: 'POST',
                  body: JSON.stringify({ email: e.target.value, password: 'Avasa@2026!' }),
                });
                setAuthToken(res.token);
                setCurrentUser(res.user);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-[#132D52] text-white border border-white/15 rounded-lg focus:outline-none"
            >
              <option value="admin@avasarealty.in">Company Admin</option>
              <option value="manager@avasarealty.in">Sales Manager</option>
              <option value="arjun@avasarealty.in">Sales Exec (Arjun)</option>
              <option value="priya@avasarealty.in">Sales Exec (Priya)</option>
              <option value="finance@avasarealty.in">Accounts &amp; Finance</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0B1F3A] text-white flex flex-col z-10">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold">Avasa Realty CRM</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium text-left cursor-pointer ${
                      active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10">
              <div className="text-xs font-semibold">{currentUser.fullName}</div>
              <div className="text-[11px] text-emerald-300 mb-3">{currentUser.roleName}</div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/10 rounded-lg text-xs font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:text-[#0B1F3A] rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">Avasa Realty</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-bold text-[#0B1F3A] truncate">{activeLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-xs">
            <span className="hidden md:inline text-slate-500 font-mono">{istNow} IST</span>
            <button
              type="button"
              onClick={() => setActiveNav('security')}
              className="px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] border border-slate-300 hover:border-emerald-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Sample SQL &amp; Docs
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {loadError && (
            <div role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {loadError}
            </div>
          )}

          {activeNav === 'dashboard' && (
            <DashboardView currentUser={currentUser} projects={projects} employees={employees} />
          )}
          {activeNav === 'leads' && (
            <LeadsView
              currentUser={currentUser}
              leads={leads}
              projects={projects}
              employees={employees}
              onRefresh={loadWorkspaceData}
              onOpenBookingForLead={(lead) => {
                setInitialBookingLeadId(lead.id);
                setActiveNav('operations');
              }}
            />
          )}
          {activeNav === 'inventory' && (
            <ProjectsPropertiesView
              currentUser={currentUser}
              projects={projects}
              properties={properties}
              onRefresh={loadWorkspaceData}
            />
          )}
          {activeNav === 'whatsapp' && (
            <WhatsAppAiView onRefreshDashboard={loadWorkspaceData} />
          )}
          {activeNav === 'operations' && (
            <OperationsView
              currentUser={currentUser}
              leads={leads}
              projects={projects}
              properties={properties}
              employees={employees}
              siteVisits={siteVisits}
              followUps={followUps}
              bookings={bookings}
              payments={payments}
              commissions={commissions}
              initialBookingLeadId={initialBookingLeadId}
              onClearInitialBookingLead={() => setInitialBookingLeadId(null)}
              onRefresh={loadWorkspaceData}
            />
          )}
          {activeNav === 'billing' && (
            <BillingReceiptsView
              currentUser={currentUser}
              employees={employees}
              leads={leads}
              customers={customers}
              projects={projects}
              properties={properties}
              bookings={bookings}
              invoices={invoices}
              tokenReceipts={tokenReceipts}
              onRefresh={loadWorkspaceData}
            />
          )}
          {activeNav === 'compliance' && (
            <ComplianceMarketingView
              currentUser={currentUser}
              customers={customers}
              consent={consent}
              campaigns={campaigns}
              projects={projects}
              onRefresh={loadWorkspaceData}
            />
          )}
          {activeNav === 'security' && (
            <SecurityDocsView
              currentUser={currentUser}
              employees={employees}
              onRefresh={loadWorkspaceData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
