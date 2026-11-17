import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import {
  formatInrCompact,
  formatInrFull,
  formatIstDateOnly,
  numberToIndianWords,
  titleize,
} from '../utils/format';
import type {
  AdvanceTokenReceiptRecord,
  BookingRecord,
  CustomerRecord,
  InvoiceLineItem,
  InvoiceRecord,
  LeadRecord,
  ProjectRecord,
  PropertyRecord,
  UserRecord,
} from '../types';

interface BillingReceiptsViewProps {
  currentUser: UserRecord;
  employees: UserRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  projects: ProjectRecord[];
  properties: PropertyRecord[];
  bookings: BookingRecord[];
  invoices: InvoiceRecord[];
  tokenReceipts: AdvanceTokenReceiptRecord[];
  onRefresh: () => Promise<void>;
}

const COMPANY_GSTIN = '29AABCA4821M1Z5';
const COMPANY_PAN = 'AABCA4821M';
const COMPANY_NAME = 'Avasa Realty & Developers Pvt. Ltd.';
const COMPANY_ADDRESS = 'Level 14, World Trade Center, Brigade Gateway, Bengaluru 560055, Karnataka';

const CATEGORY_PRESETS: Record<
  InvoiceRecord['billCategory'],
  { sac: string; cgst: number; sgst: number; defaultDesc: string }
> = {
  booking_milestone: {
    sac: '995411',
    cgst: 2.5,
    sgst: 2.5,
    defaultDesc: 'Construction & Allotment Demand Milestone',
  },
  brokerage_fee: {
    sac: '997211',
    cgst: 9,
    sgst: 9,
    defaultDesc: 'Real Estate Advisory & Brokerage Facilitation Fee',
  },
  legal_documentation: {
    sac: '997211',
    cgst: 9,
    sgst: 9,
    defaultDesc: 'Sale Deed Drafting, Khata & Registration Documentation',
  },
  maintenance_deposit: {
    sac: '999599',
    cgst: 9,
    sgst: 9,
    defaultDesc: 'Advance Society Maintenance & Clubhouse Corpus Charge',
  },
  rental_invoice: {
    sac: '997212',
    cgst: 0,
    sgst: 0,
    defaultDesc: 'Monthly Residential Lease / Rental Demand',
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadHtmlDocument(filename: string, title: string, bodyHtml: string) {
  const fullHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 32px; line-height: 1.45; }
    .sheet { max-width: 820px; margin: 0 auto; border: 1px solid #cbd5e1; padding: 28px; }
    .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #0b1f3a; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { color: #0b1f3a; font-size: 20px; font-weight: 700; }
    .sub { font-size: 12px; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f8fafc; font-weight: 700; color: #0b1f3a; }
    .num { text-align: right; font-family: monospace; }
    .total { font-weight: 700; background: #f0fdf4; color: #0b1f3a; }
    .words { background: #f8fafc; padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 12px; margin-top: 12px; }
    .foot { margin-top: 28px; display: flex; justify-content: space-between; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="sheet">${bodyHtml}</div>
</body>
</html>`;
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BillingReceiptsView({
  currentUser,
  employees,
  leads,
  customers,
  projects,
  properties,
  bookings,
  invoices,
  tokenReceipts,
  onRefresh,
}: BillingReceiptsViewProps) {
  const [subTab, setSubTab] = useState<'billing' | 'tokens'>('billing');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create Invoice Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invBookingId, setInvBookingId] = useState('');
  const [invLeadId, setInvLeadId] = useState('');
  const [invProjectId, setInvProjectId] = useState('');
  const [invPropertyId, setInvPropertyId] = useState('');
  const [billedToName, setBilledToName] = useState('');
  const [billedToPhone, setBilledToPhone] = useState('');
  const [billedToAddress, setBilledToAddress] = useState('');
  const [buyerGstOrPan, setBuyerGstOrPan] = useState('');
  const [billCategory, setBillCategory] = useState<InvoiceRecord['billCategory']>('booking_milestone');
  const [cgstRatePct, setCgstRatePct] = useState('2.5');
  const [sgstRatePct, setSgstRatePct] = useState('2.5');
  const [paidOnCreateInr, setPaidOnCreateInr] = useState('0');
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
  );
  const [invNotes, setInvNotes] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { description: CATEGORY_PRESETS.booking_milestone.defaultDesc, sacCode: '995411', amountInr: 500000 },
  ]);

  // Invoice Preview & Payment Modal
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);
  const [payInvoiceTarget, setPayInvoiceTarget] = useState<InvoiceRecord | null>(null);
  const [addPaymentAmount, setAddPaymentAmount] = useState('');

  // Create Advance Token Receipt Modal State
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokLeadId, setTokLeadId] = useState('');
  const [tokProjectId, setTokProjectId] = useState('');
  const [tokPropertyId, setTokPropertyId] = useState('');
  const [reserveUnit, setReserveUnit] = useState(true);
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [panMasked, setPanMasked] = useState('');
  const [tokPurpose, setTokPurpose] = useState<AdvanceTokenReceiptRecord['purpose']>('booking_token');
  const [tokenAmountInr, setTokenAmountInr] = useState('200000');
  const [tokPaymentMode, setTokPaymentMode] = useState<AdvanceTokenReceiptRecord['paymentMode']>('upi');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankName, setBankName] = useState('HDFC Bank');
  const [validUntilDate, setValidUntilDate] = useState(() =>
    new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  );
  const [tokRemarks, setTokRemarks] = useState('');
  const [previewReceipt, setPreviewReceipt] = useState<AdvanceTokenReceiptRecord | null>(null);

  const canManageFinance = ['admin', 'finance', 'sales_manager'].includes(currentUser.roleCode);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      map.set(emp.id, emp.fullName);
    }
    map.set(currentUser.id, currentUser.fullName);
    return map;
  }, [employees, currentUser]);

  // KPIs
  const billingStats = useMemo(() => {
    const active = invoices.filter((i) => i.status !== 'cancelled');
    const totalBilled = active.reduce((s, i) => s + i.totalAmountInr, 0);
    const totalCollected = active.reduce((s, i) => s + i.paidAmountInr, 0);
    const outstanding = Math.max(0, totalBilled - totalCollected);
    return {
      totalBilled,
      totalCollected,
      outstanding,
      count: invoices.length,
    };
  }, [invoices]);

  const tokenStats = useMemo(() => {
    const active = tokenReceipts.filter((r) => r.status !== 'refunded');
    const totalTokenHeld = active.reduce((s, r) => s + r.tokenAmountInr, 0);
    const clearedAmt = tokenReceipts
      .filter((r) => r.status === 'cleared' || r.status === 'adjusted_to_booking')
      .reduce((s, r) => s + r.tokenAmountInr, 0);
    const reservedUnits = tokenReceipts.filter((r) => r.unitReserved && r.status !== 'refunded').length;
    return {
      totalTokenHeld,
      clearedAmt,
      reservedUnits,
      count: tokenReceipts.length,
    };
  }, [tokenReceipts]);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.billedToName.toLowerCase().includes(q) ||
        inv.billedToPhone.toLowerCase().includes(q) ||
        inv.buyerGstOrPan.toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery, statusFilter]);

  const filteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tokenReceipts.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.receiptNumber.toLowerCase().includes(q) ||
        r.payerName.toLowerCase().includes(q) ||
        r.payerPhone.toLowerCase().includes(q) ||
        r.referenceNumber.toLowerCase().includes(q)
      );
    });
  }, [tokenReceipts, searchQuery, statusFilter]);

  function handleSelectBookingForInvoice(bookingId: string) {
    setInvBookingId(bookingId);
    const bk = bookings.find((b) => b.id === bookingId);
    if (!bk) return;
    setInvLeadId(bk.leadId);
    setInvProjectId(bk.projectId);
    setInvPropertyId(bk.propertyId);
    const cust = customers.find((c) => c.id === bk.customerId);
    const lead = leads.find((l) => l.id === bk.leadId);
    const prop = properties.find((p) => p.id === bk.propertyId);
    if (cust) {
      setBilledToName(cust.fullName);
      setBilledToPhone(cust.phone);
      setBilledToAddress(cust.correspondenceAddress || `${cust.city}, India`);
      setBuyerGstOrPan(cust.panMasked);
    } else if (lead) {
      setBilledToName(lead.fullName);
      setBilledToPhone(lead.phone);
      setBilledToAddress(`${lead.preferredLocality || ''}, ${lead.preferredCity}`.replace(/^,\s*/, ''));
    }
    const presetAmt = Math.round(bk.agreementValueInr * 0.1);
    setLineItems([
      {
        description: `Milestone Demand (10%) — ${prop ? prop.unitCode : bk.bookingCode}`,
        sacCode: prop?.category === 'commercial' ? '995412' : '995411',
        amountInr: presetAmt,
      },
    ]);
    if (prop?.category === 'commercial') {
      setCgstRatePct('6');
      setSgstRatePct('6');
    } else if (prop?.category === 'plot_land') {
      setCgstRatePct('0');
      setSgstRatePct('0');
    } else {
      setCgstRatePct('2.5');
      setSgstRatePct('2.5');
    }
  }

  function handleSelectLeadForInvoice(leadId: string) {
    setInvLeadId(leadId);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setBilledToName(lead.fullName);
    setBilledToPhone(lead.phone);
    setBilledToAddress(`${lead.preferredLocality ? `${lead.preferredLocality}, ` : ''}${lead.preferredCity}, India`);
    if (lead.projectId) setInvProjectId(lead.projectId);
  }

  function handleCategoryChange(cat: InvoiceRecord['billCategory']) {
    setBillCategory(cat);
    const p = CATEGORY_PRESETS[cat];
    setCgstRatePct(String(p.cgst));
    setSgstRatePct(String(p.sgst));
    setLineItems((prev) =>
      prev.map((item, idx) =>
        idx === 0 ? { ...item, sacCode: p.sac, description: item.description || p.defaultDesc } : item
      )
    );
  }

  const draftSubtotal = lineItems.reduce((s, it) => s + (Number(it.amountInr) || 0), 0);
  const draftCgst = Math.round((draftSubtotal * (Number(cgstRatePct) || 0)) / 100);
  const draftSgst = Math.round((draftSubtotal * (Number(sgstRatePct) || 0)) / 100);
  const draftTotal = draftSubtotal + draftCgst + draftSgst;

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const cust = customers.find((c) => c.leadId === invLeadId);
      await apiFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: invBookingId || null,
          customerId: cust?.id || null,
          leadId: invLeadId || null,
          projectId: invProjectId || null,
          propertyId: invPropertyId || null,
          billedToName,
          billedToPhone,
          billedToAddress,
          buyerGstOrPan,
          billCategory,
          lineItems,
          cgstRatePct: Number(cgstRatePct),
          sgstRatePct: Number(sgstRatePct),
          paidAmountInr: Number(paidOnCreateInr) || 0,
          dueDate,
          notes: invNotes || null,
        }),
      });
      setShowInvoiceModal(false);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create tax invoice.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecordInvoicePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payInvoiceTarget) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiFetch<InvoiceRecord>(`/api/invoices/${payInvoiceTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ addPaymentInr: Number(addPaymentAmount) }),
      });
      setPayInvoiceTarget(null);
      setAddPaymentAmount('');
      if (previewInvoice?.id === updated.id) setPreviewInvoice(updated);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record invoice payment.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectLeadForToken(leadId: string) {
    setTokLeadId(leadId);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setPayerName(lead.fullName);
    setPayerPhone(lead.phone);
    setPayerEmail(lead.email || '');
    if (lead.projectId) setTokProjectId(lead.projectId);
  }

  async function handleIssueTokenReceipt(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const cust = customers.find((c) => c.leadId === tokLeadId);
      const created = await apiFetch<AdvanceTokenReceiptRecord>('/api/token-receipts', {
        method: 'POST',
        body: JSON.stringify({
          leadId: tokLeadId || null,
          customerId: cust?.id || null,
          projectId: tokProjectId || null,
          propertyId: tokPropertyId || null,
          reserveUnit: Boolean(tokPropertyId && reserveUnit),
          payerName,
          payerPhone,
          payerEmail: payerEmail || null,
          panMasked: panMasked || 'XXXXX****X',
          purpose: tokPurpose,
          tokenAmountInr: Number(tokenAmountInr),
          paymentMode: tokPaymentMode,
          referenceNumber,
          bankName,
          validUntilDate,
          remarks: tokRemarks || null,
        }),
      });
      setShowTokenModal(false);
      setReferenceNumber('');
      setTokRemarks('');
      setPreviewReceipt(created);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to issue advance token receipt.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateReceiptStatus(
    receiptId: string,
    status: AdvanceTokenReceiptRecord['status']
  ) {
    setError(null);
    try {
      const updated = await apiFetch<AdvanceTokenReceiptRecord>(`/api/token-receipts/${receiptId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (previewReceipt?.id === updated.id) setPreviewReceipt(updated);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update token receipt.');
    }
  }

  function handleDownloadInvoiceHtml(inv: InvoiceRecord) {
    const prj = inv.projectId ? projectMap.get(inv.projectId) : null;
    const prop = inv.propertyId ? propertyMap.get(inv.propertyId) : null;
    const rowsHtml = inv.lineItems
      .map(
        (li, idx) =>
          `<tr><td>${idx + 1}</td><td>${escapeHtml(li.description)}</td><td class="num">${escapeHtml(
            li.sacCode
          )}</td><td class="num">${escapeHtml(formatInrFull(li.amountInr))}</td></tr>`
      )
      .join('');
    const bodyHtml = `
      <div class="hdr">
        <div>
          <div class="brand">${escapeHtml(COMPANY_NAME)}</div>
          <div class="sub">${escapeHtml(COMPANY_ADDRESS)}</div>
          <div class="sub">GSTIN: ${COMPANY_GSTIN} | PAN: ${COMPANY_PAN}</div>
        </div>
        <div style="text-align:right">
          <div class="brand">TAX INVOICE</div>
          <div class="sub">No: <strong>${escapeHtml(inv.invoiceNumber)}</strong></div>
          <div class="sub">Issue: ${escapeHtml(formatIstDateOnly(inv.issueDate))} | Due: ${escapeHtml(
      formatIstDateOnly(inv.dueDate)
    )}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;gap:24px;font-size:13px;margin-bottom:16px">
        <div>
          <strong>Billed To:</strong><br/>
          ${escapeHtml(inv.billedToName)}<br/>
          ${escapeHtml(inv.billedToAddress)}<br/>
          Phone: ${escapeHtml(inv.billedToPhone)}<br/>
          Buyer GSTIN / PAN: ${escapeHtml(inv.buyerGstOrPan)}
        </div>
        <div style="text-align:right">
          <strong>Property / Project:</strong><br/>
          ${escapeHtml(prj?.name || 'General Real Estate Services')}<br/>
          ${prop ? `Unit ${escapeHtml(prop.unitCode)} (${escapeHtml(prop.configuration)})` : ''}<br/>
          Status: <strong>${escapeHtml(titleize(inv.status))}</strong>
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Description of Supply / Demand</th><th class="num">SAC</th><th class="num">Taxable Value (INR)</th></tr></thead>
        <tbody>
          ${rowsHtml}
          <tr><td colspan="3" class="num">Subtotal</td><td class="num">${escapeHtml(formatInrFull(inv.subtotalInr))}</td></tr>
          <tr><td colspan="3" class="num">CGST (${inv.cgstRatePct}%)</td><td class="num">${escapeHtml(formatInrFull(inv.cgstAmountInr))}</td></tr>
          <tr><td colspan="3" class="num">SGST (${inv.sgstRatePct}%)</td><td class="num">${escapeHtml(formatInrFull(inv.sgstAmountInr))}</td></tr>
          <tr class="total"><td colspan="3" class="num">Grand Total Payable</td><td class="num">${escapeHtml(formatInrFull(inv.totalAmountInr))}</td></tr>
          <tr><td colspan="3" class="num">Amount Paid</td><td class="num">${escapeHtml(formatInrFull(inv.paidAmountInr))}</td></tr>
          <tr><td colspan="3" class="num">Balance Due</td><td class="num">${escapeHtml(
            formatInrFull(Math.max(0, inv.totalAmountInr - inv.paidAmountInr))
          )}</td></tr>
        </tbody>
      </table>
      <div class="words"><strong>Amount in Words:</strong> ${escapeHtml(numberToIndianWords(inv.totalAmountInr))}</div>
      ${inv.notes ? `<div class="sub" style="margin-top:10px">Notes: ${escapeHtml(inv.notes)}</div>` : ''}
      <div class="foot">
        <div>Subject to Bengaluru Jurisdiction · RERA Compliant Demand</div>
        <div>Authorized Signatory — ${escapeHtml(COMPANY_NAME)}</div>
      </div>`;
    downloadHtmlDocument(`${inv.invoiceNumber}.html`, `Tax Invoice ${inv.invoiceNumber}`, bodyHtml);
  }

  function handleDownloadTokenReceiptHtml(r: AdvanceTokenReceiptRecord) {
    const prj = r.projectId ? projectMap.get(r.projectId) : null;
    const prop = r.propertyId ? propertyMap.get(r.propertyId) : null;
    const bodyHtml = `
      <div class="hdr">
        <div>
          <div class="brand">${escapeHtml(COMPANY_NAME)}</div>
          <div class="sub">${escapeHtml(COMPANY_ADDRESS)}</div>
          <div class="sub">GSTIN: ${COMPANY_GSTIN} | PAN: ${COMPANY_PAN}</div>
        </div>
        <div style="text-align:right">
          <div class="brand">ADVANCE TOKEN RECEIPT</div>
          <div class="sub">Receipt No: <strong>${escapeHtml(r.receiptNumber)}</strong></div>
          <div class="sub">Date: ${escapeHtml(formatIstDateOnly(r.receiptDate))}</div>
        </div>
      </div>
      <table>
        <tbody>
          <tr><th style="width:32%">Received From</th><td><strong>${escapeHtml(r.payerName)}</strong> · ${escapeHtml(r.payerPhone)} ${r.payerEmail ? `(${escapeHtml(r.payerEmail)})` : ''}</td></tr>
          <tr><th>Payer PAN (Masked)</th><td class="num" style="text-align:left">${escapeHtml(r.panMasked)}</td></tr>
          <tr><th>Purpose</th><td>${escapeHtml(titleize(r.purpose))}</td></tr>
          <tr><th>Project &amp; Unit</th><td>${escapeHtml(prj?.name || 'General Property Allotment')}${prop ? ` — Unit ${escapeHtml(prop.unitCode)} (${escapeHtml(prop.configuration)})` : ''}</td></tr>
          <tr><th>Unit Hold / Lock</th><td>${r.unitReserved ? 'Unit Reserved in Inventory' : 'Priority / Non-Blocking Advance'} · Valid until ${escapeHtml(formatIstDateOnly(r.validUntilDate))}</td></tr>
          <tr><th>Payment Mode &amp; Ref</th><td>${escapeHtml(r.paymentMode.toUpperCase().replace('_', '/'))} · Ref: <strong>${escapeHtml(r.referenceNumber)}</strong> · ${escapeHtml(r.bankName)}</td></tr>
          <tr class="total"><th>Advance Token Amount</th><td class="num" style="text-align:left;font-size:16px">${escapeHtml(formatInrFull(r.tokenAmountInr))}</td></tr>
          <tr><th>Receipt Status</th><td>${escapeHtml(titleize(r.status))}</td></tr>
        </tbody>
      </table>
      <div class="words"><strong>Sum Received in Words:</strong> ${escapeHtml(numberToIndianWords(r.tokenAmountInr))}</div>
      ${r.remarks ? `<div class="sub" style="margin-top:10px">Remarks: ${escapeHtml(r.remarks)}</div>` : ''}
      <div class="foot">
        <div>Note: Token receipts via cheque/DD are subject to bank realization.</div>
        <div>Authorized Cashier — ${escapeHtml(COMPANY_NAME)}</div>
      </div>`;
    downloadHtmlDocument(`${r.receiptNumber}.html`, `Advance Token Receipt ${r.receiptNumber}`, bodyHtml);
  }

  return (
    <div className="space-y-6">
      {/* Segmented Switch & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSubTab('billing');
              setStatusFilter('all');
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              subTab === 'billing'
                ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-600'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>GST Billing &amp; Invoices ({invoices.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('tokens');
              setStatusFilter('all');
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              subTab === 'tokens'
                ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-600'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Advance Token Receipts ({tokenReceipts.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'billing' ? (
            <button
              type="button"
              onClick={() => setShowInvoiceModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create GST Tax Invoice</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowTokenModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Issue Advance Token Receipt</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Search & Filter Row */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              subTab === 'billing'
                ? 'Search invoice #, buyer name, phone, or GSTIN/PAN...'
                : 'Search receipt #, payer name, phone, or UTR/cheque ref...'
            }
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3A]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Statuses</option>
          {subTab === 'billing' ? (
            <>
              <option value="issued">Issued</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="draft">Draft</option>
              <option value="cancelled">Cancelled</option>
            </>
          ) : (
            <>
              <option value="received">Received</option>
              <option value="cleared">Cleared</option>
              <option value="adjusted_to_booking">Adjusted to Booking</option>
              <option value="refunded">Refunded</option>
            </>
          )}
        </select>
      </div>

      {/* BILLING TAB */}
      {subTab === 'billing' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Total GST Billed</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {formatInrCompact(billingStats.totalBilled)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Across active demand invoices</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Collected Against Bills</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700">
                {formatInrCompact(billingStats.totalCollected)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Verified INR receipts</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Outstanding Receivables</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-700">
                {formatInrCompact(billingStats.outstanding)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Pending buyer settlement</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Tax Invoices Issued</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {billingStats.count}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">GSTIN {COMPANY_GSTIN}</div>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 pr-3">Invoice # &amp; Date</th>
                  <th className="py-2.5 px-2">Billed To</th>
                  <th className="py-2.5 px-2">Category &amp; Project</th>
                  <th className="py-2.5 px-2 text-right">Taxable</th>
                  <th className="py-2.5 px-2 text-right">CGST+SGST</th>
                  <th className="py-2.5 px-2 text-right">Total / Paid</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 pl-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredInvoices.map((inv) => {
                  const prj = inv.projectId ? projectMap.get(inv.projectId) : null;
                  const prop = inv.propertyId ? propertyMap.get(inv.propertyId) : null;
                  const balance = Math.max(0, inv.totalAmountInr - inv.paidAmountInr);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3">
                        <div className="font-mono font-bold text-[#0B1F3A]">{inv.invoiceNumber}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {formatIstDateOnly(inv.issueDate)} · Due {formatIstDateOnly(inv.dueDate)}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-[#0B1F3A]">{inv.billedToName}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {inv.billedToPhone} · {inv.buyerGstOrPan}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-medium text-slate-700">{titleize(inv.billCategory)}</div>
                        <div className="text-[11px] text-slate-500">
                          {prj ? prj.name : 'General Advisory'}
                          {prop ? ` · ${prop.unitCode}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-700">
                        {formatInrFull(inv.subtotalInr)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-600">
                        <div>{formatInrFull(inv.cgstAmountInr + inv.sgstAmountInr)}</div>
                        <div className="text-[10px] text-slate-400">
                          {inv.cgstRatePct}%+{inv.sgstRatePct}%
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums">
                        <div className="font-bold text-[#0B1F3A]">{formatInrFull(inv.totalAmountInr)}</div>
                        <div className="text-[11px] text-emerald-700">
                          Paid {formatInrFull(inv.paidAmountInr)}
                          {balance > 0 ? ` · Bal ${formatInrCompact(balance)}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`text-[11px] font-semibold ${
                            inv.status === 'paid'
                              ? 'text-emerald-700'
                              : inv.status === 'partially_paid'
                              ? 'text-amber-700'
                              : inv.status === 'cancelled'
                              ? 'text-red-600'
                              : 'text-[#0B1F3A]'
                          }`}
                        >
                          {titleize(inv.status)}
                        </span>
                      </td>
                      <td className="py-3 pl-2 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => setPreviewInvoice(inv)}
                          className="text-[11px] font-semibold text-[#0B1F3A] hover:text-emerald-700 underline cursor-pointer"
                        >
                          View / Print
                        </button>
                        {canManageFinance && balance > 0 && inv.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayInvoiceTarget(inv);
                              setAddPaymentAmount(String(balance));
                            }}
                            className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                          >
                            Record INR
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                      No tax invoices match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* ADVANCE TOKEN RECEIPTS TAB */}
      {subTab === 'tokens' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Total Token Advances</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {formatInrCompact(tokenStats.totalTokenHeld)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Active non-refunded receipts</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Cleared / Adjusted</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700">
                {formatInrCompact(tokenStats.clearedAmt)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Realized in escrow bank</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Units Held on Token</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {tokenStats.reservedUnits}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Inventory locked via token</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[11px] font-medium text-slate-500">Receipts Issued</div>
              <div className="mt-1 text-xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {tokenStats.count}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">UPI / NEFT / Cheque / DD</div>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[840px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 pr-3">Receipt # &amp; Date</th>
                  <th className="py-2.5 px-2">Payer &amp; KYC</th>
                  <th className="py-2.5 px-2">Project &amp; Unit</th>
                  <th className="py-2.5 px-2">Mode &amp; UTR/Cheque</th>
                  <th className="py-2.5 px-2 text-right">Token Amount</th>
                  <th className="py-2.5 px-2">Hold Validity</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 pl-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredReceipts.map((r) => {
                  const prj = r.projectId ? projectMap.get(r.projectId) : null;
                  const prop = r.propertyId ? propertyMap.get(r.propertyId) : null;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3">
                        <div className="font-mono font-bold text-[#0B1F3A]">{r.receiptNumber}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {formatIstDateOnly(r.receiptDate)}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-[#0B1F3A]">{r.payerName}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {r.payerPhone} · PAN {r.panMasked}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-medium text-slate-700">{prj ? prj.name : 'General EOI'}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <span>{prop ? `Unit ${prop.unitCode}` : titleize(r.purpose)}</span>
                          {r.unitReserved && (
                            <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold">
                              <Lock className="w-3 h-3" /> Reserved
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-mono text-slate-800">
                          {r.paymentMode.toUpperCase().replace('_', '/')} · {r.referenceNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">{r.bankName}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums font-bold text-[#0B1F3A]">
                        {formatInrFull(r.tokenAmountInr)}
                      </td>
                      <td className="py-3 px-2 font-mono text-[11px] text-slate-600">
                        {formatIstDateOnly(r.validUntilDate)}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`text-[11px] font-semibold ${
                            r.status === 'cleared' || r.status === 'adjusted_to_booking'
                              ? 'text-emerald-700'
                              : r.status === 'refunded'
                              ? 'text-red-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {titleize(r.status)}
                        </span>
                      </td>
                      <td className="py-3 pl-2 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => setPreviewReceipt(r)}
                          className="text-[11px] font-semibold text-[#0B1F3A] hover:text-emerald-700 underline cursor-pointer"
                        >
                          Receipt
                        </button>
                        {canManageFinance && r.status === 'received' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateReceiptStatus(r.id, 'cleared')}
                            className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                        {canManageFinance && r.status === 'cleared' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateReceiptStatus(r.id, 'adjusted_to_booking')}
                            className="px-2 py-1 text-[11px] font-semibold bg-[#0B1F3A] hover:bg-[#132D52] text-white rounded cursor-pointer"
                          >
                            Adjust
                          </button>
                        )}
                        {canManageFinance && r.status !== 'refunded' && r.status !== 'adjusted_to_booking' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateReceiptStatus(r.id, 'refunded')}
                            className="px-2 py-1 text-[11px] font-semibold border border-red-300 text-red-700 hover:bg-red-50 rounded cursor-pointer"
                          >
                            Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredReceipts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                      No advance token receipts match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* MODAL: CREATE GST TAX INVOICE */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateInvoice}
            className="bg-white rounded-xl border border-slate-200 w-full max-w-2xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">Create GST Tax Invoice</h3>
                <p className="text-xs text-slate-500">
                  Supplier GSTIN: {COMPANY_GSTIN} · Automated CGST &amp; SGST calculation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInvoiceModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Link to Booking (Optional)</label>
                <select
                  value={invBookingId}
                  onChange={(e) => handleSelectBookingForInvoice(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Custom / Standalone Bill --</option>
                  {bookings.map((bk) => (
                    <option key={bk.id} value={bk.id}>
                      {bk.bookingCode} ({formatInrCompact(bk.totalPayableInr)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Or Prefill From Lead</label>
                <select
                  value={invLeadId}
                  onChange={(e) => handleSelectLeadForInvoice(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Select Lead --</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName} ({l.preferredCity})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Billed To Name *</label>
                <input
                  required
                  value={billedToName}
                  onChange={(e) => setBilledToName(e.target.value)}
                  placeholder="Buyer / Corporate Entity Name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Buyer Phone *</label>
                <input
                  required
                  value={billedToPhone}
                  onChange={(e) => setBilledToPhone(e.target.value)}
                  placeholder="+91 98..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Buyer GSTIN or PAN</label>
                <input
                  value={buyerGstOrPan}
                  onChange={(e) => setBuyerGstOrPan(e.target.value)}
                  placeholder="e.g. 29AABCU9603R1ZM or ABCPK4128M"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Billing Category</label>
                <select
                  value={billCategory}
                  onChange={(e) => handleCategoryChange(e.target.value as InvoiceRecord['billCategory'])}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="booking_milestone">Booking Milestone Demand (5% GST Res / 12% Com)</option>
                  <option value="brokerage_fee">Brokerage / Advisory Fee (18% GST)</option>
                  <option value="legal_documentation">Legal &amp; Registration Charges (18% GST)</option>
                  <option value="maintenance_deposit">Maintenance &amp; Corpus Deposit (18% GST)</option>
                  <option value="rental_invoice">Rental Lease Invoice (0% Residential)</option>
                </select>
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-medium text-slate-700 mb-1">Billing Address</label>
              <input
                value={billedToAddress}
                onChange={(e) => setBilledToAddress(e.target.value)}
                placeholder="Street, City, PIN, State"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            {/* Line Items */}
            <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <div className="flex items-center justify-between text-xs font-semibold text-[#0B1F3A]">
                <span>Line Items &amp; SAC Codes</span>
                <button
                  type="button"
                  onClick={() =>
                    setLineItems((prev) => [
                      ...prev,
                      {
                        description: '',
                        sacCode: CATEGORY_PRESETS[billCategory].sac,
                        amountInr: 100000,
                      },
                    ])
                  }
                  className="text-emerald-700 hover:underline cursor-pointer"
                >
                  + Add Line Item
                </button>
              </div>
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                  <input
                    required
                    value={item.description}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                      )
                    }
                    placeholder="Line item description"
                    className="col-span-6 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  />
                  <input
                    required
                    value={item.sacCode}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, sacCode: e.target.value } : row))
                      )
                    }
                    placeholder="SAC"
                    className="col-span-2 px-2 py-1.5 border border-slate-300 rounded bg-white font-mono"
                  />
                  <input
                    required
                    type="number"
                    min={1}
                    value={item.amountInr}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, amountInr: Number(e.target.value) } : row
                        )
                      )
                    }
                    placeholder="INR"
                    className="col-span-3 px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-right"
                  />
                  <button
                    type="button"
                    disabled={lineItems.length <= 1}
                    onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">CGST %</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={cgstRatePct}
                  onChange={(e) => setCgstRatePct(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">SGST %</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={sgstRatePct}
                  onChange={(e) => setSgstRatePct(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Already Paid (INR)</label>
                <input
                  type="number"
                  min={0}
                  value={paidOnCreateInr}
                  onChange={(e) => setPaidOnCreateInr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B1F3A]/5 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="space-y-0.5 text-slate-600">
                <div>
                  Taxable: <span className="font-mono font-semibold">{formatInrFull(draftSubtotal)}</span> ·
                  CGST+SGST:{' '}
                  <span className="font-mono font-semibold">{formatInrFull(draftCgst + draftSgst)}</span>
                </div>
                <div className="text-[11px] text-slate-500">{numberToIndianWords(draftTotal)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">Grand Total</div>
                <div className="text-base font-bold font-mono text-[#0B1F3A]">
                  {formatInrFull(draftTotal)}
                </div>
              </div>
            </div>

            <div className="text-xs">
              <input
                value={invNotes}
                onChange={(e) => setInvNotes(e.target.value)}
                placeholder="Notes / Escrow Bank Account details (optional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowInvoiceModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
              >
                {submitting ? 'Generating...' : 'Generate Tax Invoice'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: RECORD PAYMENT AGAINST INVOICE */}
      {payInvoiceTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordInvoicePayment}
            className="bg-white rounded-xl border border-slate-200 w-full max-w-md p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                Record Payment — {payInvoiceTarget.invoiceNumber}
              </h3>
              <button
                type="button"
                onClick={() => setPayInvoiceTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <div>Buyer: <strong>{payInvoiceTarget.billedToName}</strong></div>
              <div className="font-mono">
                Total: {formatInrFull(payInvoiceTarget.totalAmountInr)} · Balance Due:{' '}
                <strong className="text-amber-700">
                  {formatInrFull(Math.max(0, payInvoiceTarget.totalAmountInr - payInvoiceTarget.paidAmountInr))}
                </strong>
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Amount Received (INR) *</label>
              <input
                required
                type="number"
                min={1}
                max={Math.max(1, payInvoiceTarget.totalAmountInr - payInvoiceTarget.paidAmountInr)}
                value={addPaymentAmount}
                onChange={(e) => setAddPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayInvoiceTarget(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
              >
                Confirm Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ISSUE ADVANCE TOKEN RECEIPT */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleIssueTokenReceipt}
            className="bg-white rounded-xl border border-slate-200 w-full max-w-xl p-6 space-y-4 my-8 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">Issue Advance Token Receipt</h3>
                <p className="text-xs text-slate-500">
                  Record EOI / booking token payment and optionally lock the unit in inventory
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTokenModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Select Lead (Auto-fills KYC)</label>
                <select
                  value={tokLeadId}
                  onChange={(e) => handleSelectLeadForToken(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Walk-in / New Payer --</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName} ({l.preferredCity})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Token Purpose</label>
                <select
                  value={tokPurpose}
                  onChange={(e) =>
                    setTokPurpose(e.target.value as AdvanceTokenReceiptRecord['purpose'])
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="booking_token">Booking Token Advance</option>
                  <option value="eoi_priority">EOI / Priority Allotment</option>
                  <option value="unit_hold_deposit">Unit Hold Deposit</option>
                  <option value="rental_token">Rental Token Deposit</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payer Full Name *</label>
                <input
                  required
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Buyer Name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payer Mobile *</label>
                <input
                  required
                  value={payerPhone}
                  onChange={(e) => setPayerPhone(e.target.value)}
                  placeholder="+91 98..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payer Email</label>
                <input
                  type="email"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  placeholder="buyer@email.in"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">PAN (Masked for Receipt)</label>
                <input
                  value={panMasked}
                  onChange={(e) => setPanMasked(e.target.value)}
                  placeholder="e.g. ABCPK****8M"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Project</label>
                <select
                  value={tokProjectId}
                  onChange={(e) => setTokProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Select Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.city})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Property Unit</label>
                <select
                  value={tokPropertyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTokPropertyId(id);
                    const pr = properties.find((x) => x.id === id);
                    if (pr?.projectId) setTokProjectId(pr.projectId);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Optional / General EOI --</option>
                  {properties
                    .filter((p) => p.status !== 'booked')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.unitCode} · {p.configuration} ({titleize(p.status)})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {tokPropertyId && (
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={reserveUnit}
                  onChange={(e) => setReserveUnit(e.target.checked)}
                />
                <span>Lock &amp; Reserve this unit immediately in inventory until expiry date</span>
              </label>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Token Amount (INR) *</label>
                <input
                  required
                  type="number"
                  min={1000}
                  value={tokenAmountInr}
                  onChange={(e) => setTokenAmountInr(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Mode *</label>
                <select
                  value={tokPaymentMode}
                  onChange={(e) =>
                    setTokPaymentMode(e.target.value as AdvanceTokenReceiptRecord['paymentMode'])
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="upi">UPI</option>
                  <option value="neft_rtgs">NEFT / RTGS</option>
                  <option value="cheque">Cheque</option>
                  <option value="demand_draft">Demand Draft</option>
                  <option value="card">Card / POS</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Hold Valid Until</label>
                <input
                  type="date"
                  value={validUntilDate}
                  onChange={(e) => setValidUntilDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">UTR / Cheque / Ref No *</label>
                <input
                  required
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="e.g. UPI4321998811 or CHQ-882910"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Bank Name *</label>
                <input
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="HDFC Bank / ICICI / SBI"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <input
              value={tokRemarks}
              onChange={(e) => setTokRemarks(e.target.value)}
              placeholder="Terms / Token remarks (e.g., Balance 10% payable within 15 days)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />

            <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              In words: <strong>{numberToIndianWords(Number(tokenAmountInr) || 0)}</strong>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTokenModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
              >
                {submitting ? 'Issuing...' : 'Issue Advance Token Receipt'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: PRINTABLE TAX INVOICE SHEET */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-3xl p-6 space-y-4 my-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="text-sm font-bold text-[#0B1F3A]">
                Tax Invoice Preview · {previewInvoice.invoiceNumber}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] border border-slate-300 hover:border-[#0B1F3A] rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadInvoiceHtml(previewInvoice)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div id="printable-document-sheet" className="border border-slate-200 rounded-lg p-6 space-y-5 text-xs">
              <div className="flex flex-wrap justify-between gap-4 border-b-2 border-[#0B1F3A] pb-4">
                <div>
                  <h4 className="text-lg font-bold text-[#0B1F3A]">{COMPANY_NAME}</h4>
                  <p className="text-slate-600 max-w-sm mt-0.5">{COMPANY_ADDRESS}</p>
                  <p className="text-slate-600 font-mono mt-1">
                    GSTIN: {COMPANY_GSTIN} · PAN: {COMPANY_PAN}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-[#0B1F3A]">GST TAX INVOICE</div>
                  <div className="font-mono font-bold text-emerald-700 mt-1">
                    {previewInvoice.invoiceNumber}
                  </div>
                  <div className="text-slate-600 font-mono mt-0.5">
                    Issue Date: {formatIstDateOnly(previewInvoice.issueDate)}
                  </div>
                  <div className="text-slate-600 font-mono">
                    Due Date: {formatIstDateOnly(previewInvoice.dueDate)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Billed To</div>
                  <div className="font-bold text-[#0B1F3A] mt-1">{previewInvoice.billedToName}</div>
                  <div className="text-slate-600 mt-0.5">{previewInvoice.billedToAddress}</div>
                  <div className="font-mono text-slate-600 mt-0.5">{previewInvoice.billedToPhone}</div>
                  <div className="font-mono text-slate-700 mt-0.5">
                    Buyer GSTIN/PAN: {previewInvoice.buyerGstOrPan}
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Project &amp; Status</div>
                  <div className="font-semibold text-[#0B1F3A] mt-1">
                    {(previewInvoice.projectId && projectMap.get(previewInvoice.projectId)?.name) ||
                      'Real Estate Supply & Services'}
                  </div>
                  {previewInvoice.propertyId && propertyMap.get(previewInvoice.propertyId) && (
                    <div className="text-slate-600 mt-0.5">
                      Unit {propertyMap.get(previewInvoice.propertyId)!.unitCode} ·{' '}
                      {propertyMap.get(previewInvoice.propertyId)!.configuration}
                    </div>
                  )}
                  <div className="mt-1 font-semibold text-emerald-700">
                    Status: {titleize(previewInvoice.status)}
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-50 text-[#0B1F3A]">
                    <th className="border border-slate-300 px-3 py-2 text-left">#</th>
                    <th className="border border-slate-300 px-3 py-2 text-left">Description</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-mono">SAC</th>
                    <th className="border border-slate-300 px-3 py-2 text-right font-mono">Amount (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewInvoice.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="border border-slate-300 px-3 py-2">{i + 1}</td>
                      <td className="border border-slate-300 px-3 py-2">{li.description}</td>
                      <td className="border border-slate-300 px-3 py-2 text-right font-mono">{li.sacCode}</td>
                      <td className="border border-slate-300 px-3 py-2 text-right font-mono tabular-nums">
                        {formatInrFull(li.amountInr)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="border border-slate-300 px-3 py-1.5 text-right font-medium">
                      Taxable Subtotal
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatInrFull(previewInvoice.subtotalInr)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="border border-slate-300 px-3 py-1.5 text-right">
                      CGST ({previewInvoice.cgstRatePct}%)
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatInrFull(previewInvoice.cgstAmountInr)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="border border-slate-300 px-3 py-1.5 text-right">
                      SGST ({previewInvoice.sgstRatePct}%)
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatInrFull(previewInvoice.sgstAmountInr)}
                    </td>
                  </tr>
                  <tr className="bg-emerald-50 font-bold text-[#0B1F3A]">
                    <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right">
                      Grand Total (INR)
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-mono tabular-nums">
                      {formatInrFull(previewInvoice.totalAmountInr)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="border border-slate-300 px-3 py-1.5 text-right text-emerald-700">
                      Amount Paid
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums text-emerald-700">
                      {formatInrFull(previewInvoice.paidAmountInr)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="border border-slate-300 px-3 py-1.5 text-right font-semibold">
                      Balance Due
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums font-semibold">
                      {formatInrFull(Math.max(0, previewInvoice.totalAmountInr - previewInvoice.paidAmountInr))}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500">Total Amount in Words: </span>
                <strong className="text-[#0B1F3A]">
                  {numberToIndianWords(previewInvoice.totalAmountInr)}
                </strong>
              </div>

              {previewInvoice.notes && (
                <div className="text-slate-600">
                  <strong>Notes:</strong> {previewInvoice.notes}
                </div>
              )}

              <div className="flex justify-between pt-6 border-t border-slate-200 text-[11px] text-slate-500">
                <span>Subject to Bengaluru Jurisdiction · RERA Escrow Billing</span>
                <span>For {COMPANY_NAME} — Authorized Signatory</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRINTABLE ADVANCE TOKEN RECEIPT SHEET */}
      {previewReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-2xl p-6 space-y-4 my-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="text-sm font-bold text-[#0B1F3A]">
                Advance Token Receipt · {previewReceipt.receiptNumber}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] border border-slate-300 hover:border-[#0B1F3A] rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTokenReceiptHtml(previewReceipt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewReceipt(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div id="printable-document-sheet" className="border border-slate-200 rounded-lg p-6 space-y-5 text-xs">
              <div className="flex flex-wrap justify-between gap-4 border-b-2 border-[#0B1F3A] pb-4">
                <div>
                  <h4 className="text-lg font-bold text-[#0B1F3A]">{COMPANY_NAME}</h4>
                  <p className="text-slate-600 max-w-sm mt-0.5">{COMPANY_ADDRESS}</p>
                  <p className="text-slate-600 font-mono mt-1">
                    GSTIN: {COMPANY_GSTIN} · PAN: {COMPANY_PAN}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-emerald-700">ADVANCE TOKEN RECEIPT</div>
                  <div className="font-mono font-bold text-[#0B1F3A] mt-1">
                    {previewReceipt.receiptNumber}
                  </div>
                  <div className="text-slate-600 font-mono mt-0.5">
                    Receipt Date: {formatIstDateOnly(previewReceipt.receiptDate)}
                  </div>
                  <div className="text-slate-600 font-mono">
                    Hold Valid Until: {formatIstDateOnly(previewReceipt.validUntilDate)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                <div>
                  <span className="text-slate-500 block">Received with thanks from</span>
                  <strong className="text-sm text-[#0B1F3A]">{previewReceipt.payerName}</strong>
                  <div className="font-mono text-slate-600 mt-0.5">{previewReceipt.payerPhone}</div>
                  {previewReceipt.payerEmail && (
                    <div className="text-slate-600">{previewReceipt.payerEmail}</div>
                  )}
                  <div className="font-mono text-slate-600 mt-0.5">
                    PAN: {previewReceipt.panMasked}
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="text-slate-500 block">Advance Token Amount</span>
                  <strong className="text-xl font-mono tabular-nums text-emerald-700">
                    {formatInrFull(previewReceipt.tokenAmountInr)}
                  </strong>
                  <div className="mt-1 inline-flex items-center gap-1 font-semibold text-[#0B1F3A]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{titleize(previewReceipt.status)}</span>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-300">
                <tbody>
                  <tr>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left w-40">
                      Purpose
                    </th>
                    <td className="border border-slate-300 px-3 py-2">
                      {titleize(previewReceipt.purpose)}
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left">
                      Project &amp; Unit
                    </th>
                    <td className="border border-slate-300 px-3 py-2">
                      {(previewReceipt.projectId && projectMap.get(previewReceipt.projectId)?.name) ||
                        'General Allotment'}
                      {previewReceipt.propertyId && propertyMap.get(previewReceipt.propertyId)
                        ? ` — Unit ${propertyMap.get(previewReceipt.propertyId)!.unitCode} (${
                            propertyMap.get(previewReceipt.propertyId)!.configuration
                          })`
                        : ''}
                      {previewReceipt.unitReserved ? ' · [Unit Reserved]' : ''}
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left">
                      Payment Mode &amp; Ref
                    </th>
                    <td className="border border-slate-300 px-3 py-2 font-mono">
                      {previewReceipt.paymentMode.toUpperCase().replace('_', '/')} · Ref:{' '}
                      {previewReceipt.referenceNumber} · {previewReceipt.bankName}
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left">
                      Recorded By
                    </th>
                    <td className="border border-slate-300 px-3 py-2">
                      {userMap.get(previewReceipt.receivedBy) || 'Avasa Sales & Finance Desk'}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500">Sum Received in Words: </span>
                <strong className="text-[#0B1F3A]">
                  {numberToIndianWords(previewReceipt.tokenAmountInr)}
                </strong>
              </div>

              {previewReceipt.remarks && (
                <div className="text-slate-600">
                  <strong>Remarks / Terms:</strong> {previewReceipt.remarks}
                </div>
              )}

              <div className="flex justify-between pt-6 border-t border-slate-200 text-[11px] text-slate-500">
                <span>Subject to realization if paid via Cheque / Demand Draft.</span>
                <span>For {COMPANY_NAME} — Authorized Signatory</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
