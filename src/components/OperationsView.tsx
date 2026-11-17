import React, { useState } from 'react';
import { CalendarCheck, CheckCircle2, IndianRupee, Plus, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { formatInrCompact, formatInrFull, formatIstDateOnly, formatIstDateTime, titleize } from '../utils/format';
import type {
  BookingRecord,
  CommissionRecord,
  FollowUpRecord,
  LeadRecord,
  PaymentRecord,
  ProjectRecord,
  PropertyRecord,
  SiteVisitRecord,
  UserRecord,
} from '../types';

interface OperationsViewProps {
  currentUser: UserRecord;
  leads: LeadRecord[];
  projects: ProjectRecord[];
  properties: PropertyRecord[];
  employees: UserRecord[];
  siteVisits: SiteVisitRecord[];
  followUps: FollowUpRecord[];
  bookings: BookingRecord[];
  payments: PaymentRecord[];
  commissions: CommissionRecord[];
  initialBookingLeadId?: string | null;
  onClearInitialBookingLead: () => void;
  onRefresh: () => Promise<void>;
}

export function OperationsView({
  currentUser,
  leads,
  projects,
  properties,
  employees,
  siteVisits,
  followUps,
  bookings,
  payments,
  commissions,
  initialBookingLeadId,
  onClearInitialBookingLead,
  onRefresh,
}: OperationsViewProps) {
  const [subTab, setSubTab] = useState<'visits' | 'bookings' | 'payments' | 'commissions'>(
    initialBookingLeadId ? 'bookings' : 'visits'
  );
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(Boolean(initialBookingLeadId));
  const [error, setError] = useState<string | null>(null);

  const availableProps = properties.filter((p) => p.status === 'available');

  const [visitForm, setVisitForm] = useState({
    leadId: leads[0]?.id || '',
    projectId: projects[0]?.id || '',
    propertyId: '',
    scheduledAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    pickupRequired: false,
  });

  const [bookingForm, setBookingForm] = useState({
    leadId: initialBookingLeadId || leads.find((l) => l.stage !== 'booked')?.id || '',
    propertyId: availableProps[0]?.id || '',
    agreementValueInr: String(availableProps[0]?.priceInr || 16200000),
    tokenPaid: true,
    paymentMode: 'neft_rtgs',
    utrReference: `UTR${Date.now().toString().slice(-8)}`,
  });

  const canManagePayments =
    currentUser.roleCode === 'admin' ||
    currentUser.roleCode === 'finance' ||
    currentUser.roleCode === 'sales_manager';

  async function handleScheduleVisit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/site-visits', {
        method: 'POST',
        body: JSON.stringify({
          ...visitForm,
          scheduledAt: new Date(visitForm.scheduledAt).toISOString(),
          propertyId: visitForm.propertyId || null,
        }),
      });
      setShowVisitModal(false);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to schedule site visit.');
    }
  }

  async function handleCompleteVisit(id: string) {
    try {
      await apiFetch(`/api/site-visits/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          rating: 5,
          feedback: 'Site tour completed; buyer reviewed floor plan & RERA documents.',
        }),
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update visit.');
    }
  }

  async function handleCompleteFollowUp(id: string) {
    try {
      await apiFetch(`/api/follow-ups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete follow-up.');
    }
  }

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          ...bookingForm,
          agreementValueInr: Number(bookingForm.agreementValueInr),
        }),
      });
      setShowBookingModal(false);
      onClearInitialBookingLead();
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create booking.');
    }
  }

  async function handleMarkPaymentPaid(id: string) {
    try {
      await apiFetch(`/api/payments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'paid',
          paymentMode: 'neft_rtgs',
          utrReference: `HDFC${Date.now().toString().slice(-8)}`,
        }),
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to record payment.');
    }
  }

  async function handleCommissionAction(id: string, status: 'approved' | 'paid') {
    try {
      await apiFetch(`/api/commissions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update commission.');
    }
  }

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              ['visits', `Site Visits & Follow-ups (${siteVisits.length})`],
              ['bookings', `Bookings (${bookings.length})`],
              ['payments', `INR Payments (${payments.length})`],
              ['commissions', `Commissions (${commissions.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === id ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600 hover:text-[#0B1F3A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowVisitModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-[#0B1F3A] hover:bg-slate-50 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
          >
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
            <span>Schedule Site Visit</span>
          </button>
          <button
            type="button"
            onClick={() => setShowBookingModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Site Visits & Follow-ups */}
      {subTab === 'visits' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
            <h3 className="text-sm font-bold text-[#0B1F3A] mb-3">Site Visits Schedule</h3>
            <table className="w-full text-left border-collapse min-w-[540px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2 pr-3">Lead / Project</th>
                  <th className="py-2 px-2">Scheduled (IST)</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 pl-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {siteVisits.map((v) => {
                  const lead = leads.find((l) => l.id === v.leadId);
                  const prj = projects.find((p) => p.id === v.projectId);
                  return (
                    <tr key={v.id}>
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-[#0B1F3A]">{lead?.fullName || v.leadId}</div>
                        <div className="text-[11px] text-slate-500">
                          {prj?.name || 'Project'} {v.pickupRequired ? '· Chauffeur Pickup' : ''}
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono text-[11px] text-slate-600">
                        {formatIstDateTime(v.scheduledAt)}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`font-semibold ${
                            v.status === 'completed' ? 'text-emerald-700' : 'text-[#0B1F3A]'
                          }`}
                        >
                          {titleize(v.status)}
                        </span>
                      </td>
                      <td className="py-3 pl-2 text-right">
                        {v.status === 'scheduled' ? (
                          <button
                            type="button"
                            onClick={() => handleCompleteVisit(v.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-600 rounded-md hover:bg-emerald-50 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Done</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {v.rating ? `${v.rating}/5 ★` : 'Closed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0B1F3A] mb-3">Follow-Ups Queue (Automated &amp; Manual)</h3>
            <div className="divide-y divide-slate-100">
              {followUps.map((f) => {
                const lead = leads.find((l) => l.id === f.leadId);
                return (
                  <div key={f.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="text-xs">
                      <div className="font-semibold text-[#0B1F3A]">
                        {lead?.fullName || f.leadId} · {titleize(f.channel)}
                        {f.isAutomated ? ' · Auto' : ''}
                      </div>
                      <p className="text-slate-600 mt-0.5">{f.notes}</p>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        Due: {formatIstDateTime(f.dueAt)} · {titleize(f.status)}
                      </div>
                    </div>
                    {f.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleCompleteFollowUp(f.id)}
                        className="px-2.5 py-1 text-[11px] font-semibold border border-slate-300 rounded-md hover:border-emerald-600 hover:text-emerald-700 shrink-0 cursor-pointer"
                      >
                        Complete
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bookings Table */}
      {subTab === 'bookings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Booking Code &amp; Date</th>
                <th className="py-3 px-3">Project &amp; Unit</th>
                <th className="py-3 px-3">Closed By</th>
                <th className="py-3 px-3 text-right">Agreement Value</th>
                <th className="py-3 px-3 text-right">GST</th>
                <th className="py-3 px-3 text-right">Total Payable (INR)</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {bookings.map((bk) => {
                const prj = projects.find((p) => p.id === bk.projectId);
                const prop = properties.find((p) => p.id === bk.propertyId);
                const emp = employees.find((u) => u.id === bk.closedBy);
                return (
                  <tr key={bk.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-[#0B1F3A]">{bk.bookingCode}</div>
                      <div className="text-[11px] text-slate-500">{formatIstDateOnly(bk.bookingDate)}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800">{prj?.name || 'Project'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{prop?.unitCode || bk.propertyId}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-700">{emp?.fullName || bk.closedBy}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {formatInrCompact(bk.agreementValueInr)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500">
                      {formatInrCompact(bk.gstAmountInr)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                      {formatInrFull(bk.totalPayableInr)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-[#0B1F3A]">
                      {titleize(bk.status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* INR Payments Tracking */}
      {subTab === 'payments' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Milestone &amp; Booking</th>
                <th className="py-3 px-3">Due Date</th>
                <th className="py-3 px-3">Mode / UTR Reference</th>
                <th className="py-3 px-3 text-right">Amount (INR)</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {payments.map((pay) => {
                const bk = bookings.find((b) => b.id === pay.bookingId);
                return (
                  <tr key={pay.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0B1F3A]">{pay.milestoneName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{bk?.bookingCode || pay.bookingId}</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                      {formatIstDateOnly(pay.dueDate)}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {pay.paymentMode ? titleize(pay.paymentMode) : 'Awaiting'}
                      {pay.utrReference && (
                        <div className="text-[11px] font-mono text-slate-500">{pay.utrReference}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-[#0B1F3A]">
                      {formatInrFull(pay.amountInr)}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-semibold ${
                          pay.status === 'paid'
                            ? 'text-emerald-700'
                            : pay.status === 'overdue'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {titleize(pay.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {pay.status !== 'paid' && canManagePayments ? (
                        <button
                          type="button"
                          onClick={() => handleMarkPaymentPaid(pay.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md cursor-pointer"
                        >
                          <IndianRupee className="w-3 h-3" />
                          <span>Record Paid</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {pay.paidDate ? `Paid ${formatIstDateOnly(pay.paidDate)}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Commissions Management */}
      {subTab === 'commissions' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Sales Executive</th>
                <th className="py-3 px-3">Booking</th>
                <th className="py-3 px-3 text-right">Rate</th>
                <th className="py-3 px-3 text-right">Gross (INR)</th>
                <th className="py-3 px-3 text-right">TDS 5% (194H)</th>
                <th className="py-3 px-3 text-right">Net Payable</th>
                <th className="py-3 px-4 text-right">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {commissions.map((com) => {
                const emp = employees.find((u) => u.id === com.employeeId);
                const bk = bookings.find((b) => b.id === com.bookingId);
                const canApprove =
                  currentUser.roleCode === 'admin' || currentUser.roleCode === 'finance';
                return (
                  <tr key={com.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-[#0B1F3A]">
                      {emp?.fullName || com.employeeId}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {bk?.bookingCode || com.bookingId}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {com.commissionRatePct}%
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {formatInrFull(com.grossAmountInr)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-red-700">
                      -{formatInrFull(com.tdsDeductedInr)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                      {formatInrFull(com.netPayableInr)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {com.status === 'pending' && canApprove ? (
                        <button
                          type="button"
                          onClick={() => handleCommissionAction(com.id, 'approved')}
                          className="px-2.5 py-1 text-[11px] font-semibold border border-emerald-600 text-emerald-700 rounded-md hover:bg-emerald-50 cursor-pointer"
                        >
                          Approve
                        </button>
                      ) : com.status === 'approved' && canApprove ? (
                        <button
                          type="button"
                          onClick={() => handleCommissionAction(com.id, 'paid')}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-[#0B1F3A] text-white rounded-md cursor-pointer"
                        >
                          Mark Paid
                        </button>
                      ) : (
                        <span className="font-semibold text-slate-700">{titleize(com.status)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule Visit Modal */}
      {showVisitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#0B1F3A]">Schedule Property Site Visit</h3>
              <button type="button" onClick={() => setShowVisitModal(false)} className="p-1 text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleScheduleVisit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Select Lead *</label>
                <select
                  required
                  value={visitForm.leadId}
                  onChange={(e) => setVisitForm({ ...visitForm, leadId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName} ({l.preferredCity})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Project *</label>
                <select
                  required
                  value={visitForm.projectId}
                  onChange={(e) => setVisitForm({ ...visitForm, projectId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.city})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Date &amp; Time (IST) *</label>
                <input
                  type="datetime-local"
                  required
                  value={visitForm.scheduledAt}
                  onChange={(e) => setVisitForm({ ...visitForm, scheduledAt: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={visitForm.pickupRequired}
                  onChange={(e) => setVisitForm({ ...visitForm, pickupRequired: e.target.checked })}
                />
                <span>Chauffeur Pickup Required</span>
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowVisitModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg cursor-pointer">
                  Confirm Visit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Booking Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#0B1F3A]">Confirm Unit Booking</h3>
              <button
                type="button"
                onClick={() => {
                  setShowBookingModal(false);
                  onClearInitialBookingLead();
                }}
                className="p-1 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateBooking} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lead / Buyer *</label>
                <select
                  required
                  value={bookingForm.leadId}
                  onChange={(e) => setBookingForm({ ...bookingForm, leadId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {leads
                    .filter((l) => l.stage !== 'booked')
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.fullName} ({l.leadCode})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Available Property Unit *</label>
                <select
                  required
                  value={bookingForm.propertyId}
                  onChange={(e) => {
                    const prop = availableProps.find((p) => p.id === e.target.value);
                    setBookingForm({
                      ...bookingForm,
                      propertyId: e.target.value,
                      agreementValueInr: prop ? String(prop.priceInr) : bookingForm.agreementValueInr,
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {availableProps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.unitCode} — {p.title} ({formatInrCompact(p.priceInr)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Agreement Value (INR) *</label>
                <input
                  required
                  type="number"
                  value={bookingForm.agreementValueInr}
                  onChange={(e) => setBookingForm({ ...bookingForm, agreementValueInr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Booking Token UTR</label>
                <input
                  value={bookingForm.utrReference}
                  onChange={(e) => setBookingForm({ ...bookingForm, utrReference: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowBookingModal(false);
                    onClearInitialBookingLead();
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg cursor-pointer">
                  Confirm Booking &amp; Lock Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
