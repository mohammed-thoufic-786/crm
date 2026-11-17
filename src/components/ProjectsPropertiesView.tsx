import React, { useState } from 'react';
import { Building2, Plus, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { formatInrCompact, formatInrFull, titleize } from '../utils/format';
import type {
  ProjectRecord,
  PropertyCategory,
  PropertyRecord,
  TransactionType,
  UserRecord,
} from '../types';

interface ProjectsPropertiesViewProps {
  currentUser: UserRecord;
  projects: ProjectRecord[];
  properties: PropertyRecord[];
  onRefresh: () => Promise<void>;
}

export function ProjectsPropertiesView({
  currentUser,
  projects,
  properties,
  onRefresh,
}: ProjectsPropertiesViewProps) {
  const [catFilter, setCatFilter] = useState<'all' | PropertyCategory>('all');
  const [txFilter, setTxFilter] = useState<'all' | TransactionType>('all');
  const [showAddProp, setShowAddProp] = useState(false);
  const [showAddProj, setShowAddProj] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = currentUser.roleCode === 'admin' || currentUser.roleCode === 'sales_manager';

  const [propForm, setPropForm] = useState({
    projectId: projects[0]?.id || '',
    unitCode: '',
    title: '',
    category: 'apartment' as PropertyCategory,
    transactionType: 'primary_sale' as TransactionType,
    city: 'Bengaluru',
    locality: '',
    configuration: '3 BHK',
    carpetAreaSqft: '1380',
    superBuiltupSqft: '1850',
    facing: 'East',
    priceInr: '16500000',
    monthlyRentInr: '',
  });

  const [projForm, setProjForm] = useState({
    name: '',
    reraId: '',
    projectType: 'residential',
    city: 'Bengaluru',
    microMarket: '',
    totalUnits: '100',
    basePriceMinInr: '11000000',
    basePriceMaxInr: '24000000',
    possessionDate: '2027-12-31',
  });

  const filteredProps = properties.filter((p) => {
    if (catFilter !== 'all' && p.category !== catFilter) return false;
    if (txFilter !== 'all' && p.transactionType !== txFilter) return false;
    return true;
  });

  async function handleAddProperty(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/properties', {
        method: 'POST',
        body: JSON.stringify({
          ...propForm,
          projectId: propForm.projectId || null,
          carpetAreaSqft: Number(propForm.carpetAreaSqft),
          superBuiltupSqft: Number(propForm.superBuiltupSqft),
          priceInr: Number(propForm.priceInr),
          monthlyRentInr: propForm.monthlyRentInr ? Number(propForm.monthlyRentInr) : null,
        }),
      });
      setShowAddProp(false);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to add property.');
    }
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...projForm,
          totalUnits: Number(projForm.totalUnits),
          basePriceMinInr: Number(projForm.basePriceMinInr),
          basePriceMaxInr: Number(projForm.basePriceMaxInr),
        }),
      });
      setShowAddProj(false);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create project.');
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Real Estate Development Projects */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0B1F3A]">Development Projects (RERA Registered)</h3>
            <p className="text-xs text-slate-500">
              Residential towers, villa enclaves, Grade-A commercial hubs &amp; plotted land developments
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddProj(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B1F3A] hover:bg-[#132D52] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Project</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {projects.map((prj) => (
            <article
              key={prj.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
            >
              <div className="relative h-44 bg-slate-100">
                <img
                  src={prj.imageUrl}
                  alt={prj.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {prj.city} · {prj.microMarket} · {titleize(prj.projectType)}
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-[#0B1F3A]">{prj.name}</h4>
                  <p className="mt-1 text-[11px] font-mono text-slate-500 truncate" title={prj.reraId}>
                    RERA: {prj.reraId}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500">Price Range</div>
                    <div className="font-mono tabular-nums font-semibold text-emerald-700">
                      {formatInrCompact(prj.basePriceMinInr)} – {formatInrCompact(prj.basePriceMaxInr)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">Available</div>
                    <div className="font-mono tabular-nums font-semibold text-[#0B1F3A]">
                      {prj.availableUnits}/{prj.totalUnits}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Multi-Category Property Inventory */}
      <section className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['all', 'All Types'],
                  ['apartment', 'Apartments'],
                  ['villa', 'Villas'],
                  ['residential', 'Residential'],
                  ['commercial', 'Commercial'],
                  ['plot_land', 'Plots & Land'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setCatFilter(val)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    catFilter === val ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600 hover:text-[#0B1F3A]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['all', 'All Deals'],
                  ['primary_sale', 'Primary Sale'],
                  ['resale', 'Resale'],
                  ['rental', 'Rental'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTxFilter(val)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    txFilter === val ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-[#0B1F3A]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddProp(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Property Unit</span>
            </button>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Unit &amp; Property Title</th>
                <th className="py-3 px-3">Category / Deal</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3 text-right">Area (sq.ft)</th>
                <th className="py-3 px-3 text-right">Price / Rent (INR)</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredProps.map((prop) => (
                <tr key={prop.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[#0B1F3A]">{prop.title}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {prop.unitCode} · {prop.configuration} · {prop.facing} Facing
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    <div>{titleize(prop.category)}</div>
                    <div className="text-[11px] text-slate-500">{titleize(prop.transactionType)}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    <div>{prop.city}</div>
                    <div className="text-[11px] text-slate-500">{prop.locality}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                    <div>{prop.superBuiltupSqft.toLocaleString('en-IN')} SBA</div>
                    <div className="text-[11px] text-slate-500">
                      {prop.carpetAreaSqft.toLocaleString('en-IN')} Carpet
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {prop.transactionType === 'rental' && prop.monthlyRentInr ? (
                      <>
                        <div className="font-semibold text-emerald-700">
                          {formatInrFull(prop.monthlyRentInr)}/mo
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Deposit: {formatInrCompact(prop.securityDepositInr || 0)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-[#0B1F3A]">
                          {formatInrCompact(prop.priceInr)}
                        </div>
                        <div className="text-[11px] text-slate-500">{formatInrFull(prop.priceInr)}</div>
                      </>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`font-semibold ${
                        prop.status === 'available'
                          ? 'text-emerald-700'
                          : prop.status === 'booked'
                          ? 'text-[#0B1F3A]'
                          : 'text-slate-500'
                      }`}
                    >
                      {titleize(prop.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Property Modal */}
      {showAddProp && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-base font-bold text-[#0B1F3A]">Add Property Inventory Unit</h3>
              </div>
              <button type="button" onClick={() => setShowAddProp(false)} className="p-1 text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddProperty} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Property Title *</label>
                <input
                  required
                  value={propForm.title}
                  onChange={(e) => setPropForm({ ...propForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unit Code *</label>
                <input
                  required
                  placeholder="BLR-C-902"
                  value={propForm.unitCode}
                  onChange={(e) => setPropForm({ ...propForm, unitCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={propForm.category}
                  onChange={(e) => setPropForm({ ...propForm, category: e.target.value as PropertyCategory })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="apartment">Apartment</option>
                  <option value="villa">Villa</option>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="plot_land">Plot &amp; Land</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Transaction Type</label>
                <select
                  value={propForm.transactionType}
                  onChange={(e) => setPropForm({ ...propForm, transactionType: e.target.value as TransactionType })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="primary_sale">Primary Sale</option>
                  <option value="resale">Resale</option>
                  <option value="rental">Rental</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">City *</label>
                <input
                  required
                  value={propForm.city}
                  onChange={(e) => setPropForm({ ...propForm, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Locality *</label>
                <input
                  required
                  value={propForm.locality}
                  onChange={(e) => setPropForm({ ...propForm, locality: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Price (INR) *</label>
                <input
                  required
                  type="number"
                  value={propForm.priceInr}
                  onChange={(e) => setPropForm({ ...propForm, priceInr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowAddProp(false)} className="px-4 py-2 border border-slate-300 rounded-lg cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg cursor-pointer">
                  Save Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Project Modal */}
      {showAddProj && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#0B1F3A]">New Development Project</h3>
              <button type="button" onClick={() => setShowAddProj(false)} className="p-1 text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddProject} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Project Name *</label>
                <input
                  required
                  value={projForm.name}
                  onChange={(e) => setProjForm({ ...projForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">RERA ID *</label>
                <input
                  required
                  value={projForm.reraId}
                  onChange={(e) => setProjForm({ ...projForm, reraId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">City *</label>
                <input
                  required
                  value={projForm.city}
                  onChange={(e) => setProjForm({ ...projForm, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Micro-Market</label>
                <input
                  value={projForm.microMarket}
                  onChange={(e) => setProjForm({ ...projForm, microMarket: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Total Units</label>
                <input
                  type="number"
                  value={projForm.totalUnits}
                  onChange={(e) => setProjForm({ ...projForm, totalUnits: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowAddProj(false)} className="px-4 py-2 border border-slate-300 rounded-lg cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg cursor-pointer">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
