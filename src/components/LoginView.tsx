import React, { useState } from 'react';
import { Building2, Lock, Mail, ShieldCheck, ArrowRight } from 'lucide-react';
import { apiFetch, setAuthToken } from '../services/api';
import type { UserRecord } from '../types';

interface LoginViewProps {
  onAuthenticated: (user: UserRecord, permissions: string[]) => void;
}

const ROLE_PRESETS = [
  {
    label: 'Company Admin',
    email: 'admin@avasarealty.in',
    summary: 'All projects, PII, RBAC, audit & backups',
  },
  {
    label: 'Sales Manager',
    email: 'manager@avasarealty.in',
    summary: 'Team analytics, lead assignment & campaigns',
  },
  {
    label: 'Sales Executive',
    email: 'arjun@avasarealty.in',
    summary: 'Row-level isolated to assigned leads & PII',
  },
  {
    label: 'Accounts & Finance',
    email: 'finance@avasarealty.in',
    summary: 'Bookings, INR milestones & TDS commissions',
  },
];

export function LoginView({ onAuthenticated }: LoginViewProps) {
  const [email, setEmail] = useState('admin@avasarealty.in');
  const [password, setPassword] = useState('Avasa@2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithCredentials(targetEmail: string, targetPassword: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        token: string;
        user: UserRecord;
        permissions: string[];
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user, res.permissions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signInWithCredentials(email, password);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Brand Showcase */}
      <div className="lg:w-1/2 bg-[#0B1F3A] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 text-emerald-400 font-semibold text-sm tracking-wide">
            <Building2 className="w-5 h-5" />
            <span>Avasa Realty CRM</span>
          </div>
          <h1 className="mt-8 text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-balance">
            AI-Powered Real Estate Operations for Indian Developments
          </h1>
          <p className="mt-4 text-slate-300 text-base leading-relaxed max-w-xl">
            Includes built-in Sample SQL tables, WhatsApp Business AI Sandbox, and role-based access control — ready to explore immediately with zero external setup.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/10 pt-8">
          <div>
            <p className="text-xs text-slate-400">Market & Currency</p>
            <p className="mt-1 text-sm font-semibold text-white">India · INR (₹) · Asia/Kolkata</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Security & Compliance</p>
            <p className="mt-1 text-sm font-semibold text-white">Row-Level RBAC · DPDP Act 2023</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">WhatsApp & AI Demo</p>
            <p className="mt-1 text-sm font-semibold text-white">Built-in Sandbox · 8 Indian Languages</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Database Demo</p>
            <p className="mt-1 text-sm font-semibold text-white">17-Table PostgreSQL SQL &amp; Live Explorer</p>
          </div>
        </div>
      </div>

      {/* Right Sign-In Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
            <ShieldCheck className="w-4 h-4" />
            <span>Interactive Demo Ready · No External Keys Required</span>
          </div>
          <h2 className="mt-2 text-2xl font-bold text-[#0B1F3A]">Launch CRM Demo</h2>
          <p className="mt-1 text-sm text-slate-500">
            Click any role below to enter the live workspace immediately, or sign in with credentials.
          </p>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => signInWithCredentials('admin@avasarealty.in', 'Avasa@2026!')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>Enter Demo as Admin</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => signInWithCredentials('arjun@avasarealty.in', 'Avasa@2026!')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0B1F3A] hover:bg-[#132D52] disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>Enter Demo as Sales Exec</span>
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {ROLE_PRESETS.map((preset) => {
              const active = email === preset.email;
              return (
                <button
                  key={preset.email}
                  type="button"
                  onClick={() => {
                    setEmail(preset.email);
                    setPassword('Avasa@2026!');
                  }}
                  className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'border-emerald-600 bg-emerald-50/70 text-[#0B1F3A]'
                      : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">{preset.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{preset.summary}</div>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#0B1F3A] hover:bg-[#132D52] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <span>{loading ? 'Verifying Credentials...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
