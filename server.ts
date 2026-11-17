import fs from 'fs';
import path from 'path';
import express from 'express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  AuthenticatedRequest,
  hashPassword,
  requireAuth,
  requireRoles,
  signJwt,
  verifyPassword,
} from './server/auth.ts';
import {
  canAccessCustomer,
  canAccessLead,
  computeDashboardMetrics,
  createDatabaseBackup,
  formatIstDate,
  getDb,
  isContactOptedOut,
  newId,
  saveDb,
  stripPassword,
  writeAuditLog,
} from './server/db.ts';
import { generateRealEstateAiReply } from './server/ai.ts';
import { CRM_DOCUMENTATION } from './server/docs.ts';
import type {
  AdvanceTokenReceiptRecord,
  InvoiceLineItem,
  InvoiceRecord,
} from './src/types.ts';

dotenv.config();

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Security headers (Encryption-in-transit / clickjacking / MIME sniffing protection)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      istTime: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    });
  });

  // =========================================================================
  // 1. AUTHENTICATION
  // =========================================================================
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const db = getDb();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === String(email).trim().toLowerCase()
    );
    if (!user || !user.isActive || !verifyPassword(String(password), user.passwordHash)) {
      writeAuditLog({
        actorUserId: user?.id ?? null,
        actorName: String(email),
        actorRole: user?.roleCode ?? null,
        action: 'LOGIN_FAILED',
        entityType: 'auth',
        details: { email },
        ipAddress: req.ip || '127.0.0.1',
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    user.lastLoginAt = new Date().toISOString();
    saveDb();

    const token = signJwt({
      sub: user.id,
      email: user.email,
      roleCode: user.roleCode,
      fullName: user.fullName,
    });

    writeAuditLog({
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.roleCode,
      action: 'LOGIN_SUCCESS',
      entityType: 'auth',
      entityId: user.id,
      ipAddress: req.ip || '127.0.0.1',
    });

    res.json({
      token,
      user: stripPassword(user),
      permissions: db.rolePermissions[user.roleCode] || [],
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.auth!.sub);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({
      user: stripPassword(user),
      permissions: db.rolePermissions[user.roleCode] || [],
    });
  });

  // =========================================================================
  // 2. DASHBOARD ANALYTICS
  // =========================================================================
  app.get('/api/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const { startDate, endDate, projectId, employeeId, location } = req.query as Record<
      string,
      string | undefined
    >;
    const metrics = computeDashboardMetrics({
      userId: req.auth!.sub,
      roleCode: req.auth!.roleCode,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      projectId: projectId || undefined,
      employeeId: employeeId || undefined,
      location: location || undefined,
    });
    res.json(metrics);
  });

  // =========================================================================
  // 3. LEADS & ASSIGNMENT
  // =========================================================================
  app.get('/api/leads', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const { temperature, stage, source, projectId, location, q } = req.query as Record<
      string,
      string | undefined
    >;
    const visible = db.leads.filter((l) => {
      if (!canAccessLead(req.auth!.sub, req.auth!.roleCode, l)) return false;
      if (temperature && l.temperature !== temperature) return false;
      if (stage && l.stage !== stage) return false;
      if (source && l.source !== source) return false;
      if (projectId && l.projectId !== projectId) return false;
      if (location && l.preferredCity.toLowerCase() !== location.toLowerCase()) return false;
      if (q) {
        const needle = q.toLowerCase();
        const match =
          l.fullName.toLowerCase().includes(needle) ||
          l.leadCode.toLowerCase().includes(needle) ||
          l.phone.includes(needle) ||
          (l.preferredLocality || '').toLowerCase().includes(needle);
        if (!match) return false;
      }
      return true;
    });
    res.json(visible);
  });

  app.post('/api/leads', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.fullName || !b.phone || !b.preferredCity) {
      return res.status(400).json({ error: 'fullName, phone, and preferredCity are required.' });
    }
    const now = new Date().toISOString();
    const assignedTo =
      req.auth!.roleCode === 'sales_exec' ? req.auth!.sub : b.assignedTo || req.auth!.sub;

    const lead = {
      id: newId('lead'),
      leadCode: `AVS-2026-${114 + db.leads.length}`,
      fullName: String(b.fullName).trim(),
      phone: String(b.phone).trim(),
      email: b.email ? String(b.email).trim() : null,
      preferredLanguage: b.preferredLanguage || 'en',
      source: b.source || 'website',
      temperature: b.temperature || 'warm',
      stage: b.stage || 'new',
      interestedCategory: b.interestedCategory || 'apartment',
      transactionIntent: b.transactionIntent || 'primary_sale',
      preferredCity: String(b.preferredCity).trim(),
      preferredLocality: b.preferredLocality ? String(b.preferredLocality).trim() : null,
      budgetMinInr: Number(b.budgetMinInr) || 10000000,
      budgetMaxInr: Number(b.budgetMaxInr) || 20000000,
      projectId: b.projectId || null,
      assignedTo,
      aiSummary: b.aiSummary || 'Created in CRM pipeline.',
      lastContactedAt: null,
      retentionExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    db.leads.unshift(lead);

    // Create default consent record if explicitly granted
    if (b.consentGranted !== false) {
      db.consent.unshift({
        id: newId('con'),
        leadId: lead.id,
        customerId: null,
        contactName: lead.fullName,
        phone: lead.phone,
        channel: 'whatsapp',
        purpose: 'sales_followup',
        status: 'granted',
        sourceProof: `CRM Lead Capture (${lead.source})`,
        grantedAt: now,
        withdrawnAt: null,
        updatedAt: now,
      });
    }

    // Automated initial follow-up in 2 hours
    db.followUps.unshift({
      id: newId('fu'),
      leadId: lead.id,
      assignedTo: assignedTo || req.auth!.sub,
      channel: 'whatsapp',
      dueAt: new Date(Date.now() + 2 * 3600000).toISOString(),
      notes: `Automated first-touch follow-up for ${lead.fullName} (${lead.interestedCategory}).`,
      isAutomated: true,
      status: 'pending',
      completedAt: null,
      createdAt: now,
    });

    saveDb();
    writeAuditLog({
      actorUserId: req.auth!.sub,
      actorName: req.auth!.fullName,
      actorRole: req.auth!.roleCode,
      action: 'LEAD_CREATED',
      entityType: 'leads',
      entityId: lead.id,
      details: { leadCode: lead.leadCode, source: lead.source },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(201).json(lead);
  });

  app.patch('/api/leads/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const lead = db.leads.find((l) => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (!canAccessLead(req.auth!.sub, req.auth!.roleCode, lead)) {
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'LEAD_ACCESS_DENIED',
        entityType: 'leads',
        entityId: lead.id,
        ipAddress: req.ip || '127.0.0.1',
      });
      return res.status(403).json({ error: 'Forbidden: You cannot modify an unassigned lead.' });
    }
    const body = req.body ?? {};
    if (body.temperature !== undefined) lead.temperature = body.temperature;
    if (body.stage !== undefined) lead.stage = body.stage;
    if (body.preferredLanguage !== undefined) lead.preferredLanguage = body.preferredLanguage;
    if (body.interestedCategory !== undefined) lead.interestedCategory = body.interestedCategory;
    if (body.transactionIntent !== undefined) lead.transactionIntent = body.transactionIntent;
    if (body.preferredCity !== undefined) lead.preferredCity = body.preferredCity;
    if (body.preferredLocality !== undefined) lead.preferredLocality = body.preferredLocality;
    if (body.budgetMinInr !== undefined) lead.budgetMinInr = Number(body.budgetMinInr);
    if (body.budgetMaxInr !== undefined) lead.budgetMaxInr = Number(body.budgetMaxInr);
    if (body.projectId !== undefined) lead.projectId = body.projectId;
    if (body.aiSummary !== undefined) lead.aiSummary = body.aiSummary;
    lead.updatedAt = new Date().toISOString();
    saveDb();
    res.json(lead);
  });

  app.post(
    '/api/leads/:id/assign',
    requireAuth,
    requireRoles('admin', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const lead = db.leads.find((l) => l.id === req.params.id);
      if (!lead) return res.status(404).json({ error: 'Lead not found.' });
      const { assignedTo } = req.body ?? {};
      const employee = db.users.find((u) => u.id === assignedTo && u.isActive);
      if (!employee) return res.status(400).json({ error: 'Valid active employee required.' });

      lead.assignedTo = employee.id;
      lead.updatedAt = new Date().toISOString();

      // Keep conversation, pending follow-ups, and scheduled visits ownership aligned
      for (const conv of db.conversations) {
        if (conv.leadId === lead.id) conv.assignedTo = employee.id;
      }
      for (const fu of db.followUps) {
        if (fu.leadId === lead.id && fu.status === 'pending') fu.assignedTo = employee.id;
      }
      for (const sv of db.siteVisits) {
        if (sv.leadId === lead.id && sv.status === 'scheduled') sv.assignedTo = employee.id;
      }

      saveDb();
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'LEAD_ASSIGNED',
        entityType: 'leads',
        entityId: lead.id,
        details: { assignedTo: employee.id, employeeName: employee.fullName },
        ipAddress: req.ip || '127.0.0.1',
      });
      res.json(lead);
    }
  );

  // =========================================================================
  // 4. PROJECTS & PROPERTIES INVENTORY
  // =========================================================================
  app.get('/api/projects', requireAuth, (req, res) => {
    const db = getDb();
    const { city, type } = req.query as Record<string, string | undefined>;
    const list = db.projects.filter((p) => {
      if (city && p.city.toLowerCase() !== city.toLowerCase()) return false;
      if (type && p.projectType !== type) return false;
      return true;
    });
    res.json(list);
  });

  app.post(
    '/api/projects',
    requireAuth,
    requireRoles('admin', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.name || !b.reraId || !b.city) {
        return res.status(400).json({ error: 'name, reraId, and city are required.' });
      }
      const project = {
        id: newId('prj'),
        code: b.code || `PRJ-${String(b.city).slice(0, 3).toUpperCase()}-${db.projects.length + 1}`,
        name: String(b.name),
        developerName: b.developerName || 'Avasa Urban Developers Pvt Ltd',
        reraId: String(b.reraId),
        projectType: b.projectType || 'residential',
        city: String(b.city),
        microMarket: b.microMarket || 'Central Corridor',
        address: b.address || `${b.city}, India`,
        totalUnits: Number(b.totalUnits) || 50,
        availableUnits: Number(b.availableUnits ?? b.totalUnits) || 50,
        basePriceMinInr: Number(b.basePriceMinInr) || 10000000,
        basePriceMaxInr: Number(b.basePriceMaxInr) || 25000000,
        possessionDate: b.possessionDate || '2027-12-31',
        status: b.status || 'under_construction',
        imageUrl: b.imageUrl || '/src/assets/images/project_skyline_residences_1794906610259.jpg',
        createdAt: new Date().toISOString(),
      };
      db.projects.unshift(project);
      saveDb();
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'PROJECT_CREATED',
        entityType: 'projects',
        entityId: project.id,
        details: { code: project.code, reraId: project.reraId },
        ipAddress: req.ip || '127.0.0.1',
      });
      res.status(201).json(project);
    }
  );

  app.get('/api/properties', requireAuth, (req, res) => {
    const db = getDb();
    const { category, transactionType, status, city, projectId } = req.query as Record<
      string,
      string | undefined
    >;
    const list = db.properties.filter((p) => {
      if (category && p.category !== category) return false;
      if (transactionType && p.transactionType !== transactionType) return false;
      if (status && p.status !== status) return false;
      if (city && p.city.toLowerCase() !== city.toLowerCase()) return false;
      if (projectId && p.projectId !== projectId) return false;
      return true;
    });
    res.json(list);
  });

  app.post(
    '/api/properties',
    requireAuth,
    requireRoles('admin', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.title || !b.category || !b.city || !b.priceInr) {
        return res.status(400).json({ error: 'title, category, city, and priceInr are required.' });
      }
      const prop = {
        id: newId('prop'),
        projectId: b.projectId || null,
        unitCode: b.unitCode || `UNIT-${db.properties.length + 101}`,
        title: String(b.title),
        category: b.category,
        transactionType: b.transactionType || 'primary_sale',
        city: String(b.city),
        locality: b.locality || 'Prime Sector',
        configuration: b.configuration || '3 BHK',
        carpetAreaSqft: Number(b.carpetAreaSqft) || 1400,
        superBuiltupSqft: Number(b.superBuiltupSqft) || 1800,
        facing: b.facing || 'East',
        floorNumber: b.floorNumber !== undefined ? Number(b.floorNumber) : 1,
        priceInr: Number(b.priceInr),
        monthlyRentInr: b.monthlyRentInr ? Number(b.monthlyRentInr) : null,
        securityDepositInr: b.securityDepositInr ? Number(b.securityDepositInr) : null,
        furnishing: b.furnishing || 'unfurnished',
        status: b.status || 'available',
        createdAt: new Date().toISOString(),
      };
      db.properties.unshift(prop);
      saveDb();
      res.status(201).json(prop);
    }
  );

  app.patch(
    '/api/properties/:id',
    requireAuth,
    requireRoles('admin', 'sales_manager'),
    (req, res) => {
      const db = getDb();
      const prop = db.properties.find((p) => p.id === req.params.id);
      if (!prop) return res.status(404).json({ error: 'Property not found.' });
      if (req.body.status) prop.status = req.body.status;
      if (req.body.priceInr) prop.priceInr = Number(req.body.priceInr);
      saveDb();
      res.json(prop);
    }
  );

  // =========================================================================
  // 5. CUSTOMERS & STRICT PII ISOLATION
  // =========================================================================
  app.get('/api/customers', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const visible = db.customers.filter((c) =>
      canAccessCustomer(req.auth!.sub, req.auth!.roleCode, c)
    );
    res.json(visible);
  });

  app.get('/api/customers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const cust = db.customers.find((c) => c.id === req.params.id);
    if (!cust) return res.status(404).json({ error: 'Customer not found.' });
    if (!canAccessCustomer(req.auth!.sub, req.auth!.roleCode, cust)) {
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'PII_ACCESS_DENIED',
        entityType: 'customers',
        entityId: cust.id,
        details: { attemptedCustomerName: cust.fullName },
        ipAddress: req.ip || '127.0.0.1',
      });
      return res.status(403).json({
        error: 'Forbidden: Customer PII is restricted to the assigned sales executive or admin/finance.',
      });
    }
    res.json(cust);
  });

  app.post('/api/customers', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.fullName || !b.phone || !b.email) {
      return res.status(400).json({ error: 'fullName, phone, and email are required.' });
    }
    const cust = {
      id: newId('cust'),
      leadId: b.leadId || null,
      assignedTo: b.assignedTo || req.auth!.sub,
      fullName: String(b.fullName),
      phone: String(b.phone),
      email: String(b.email),
      panMasked: b.panMasked || 'XXXXX****X',
      city: b.city || 'Bengaluru',
      correspondenceAddress: b.correspondenceAddress || 'India',
      kycVerified: Boolean(b.kycVerified),
      createdAt: new Date().toISOString(),
    };
    db.customers.unshift(cust);
    saveDb();
    res.status(201).json(cust);
  });

  // =========================================================================
  // 6. CONSENT & OPT-OUT MANAGEMENT (DPDP ACT 2023)
  // =========================================================================
  app.get('/api/consent', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    if (req.auth!.roleCode === 'sales_exec') {
      const myLeadIds = new Set(
        db.leads.filter((l) => l.assignedTo === req.auth!.sub).map((l) => l.id)
      );
      return res.json(db.consent.filter((c) => c.leadId && myLeadIds.has(c.leadId)));
    }
    res.json(db.consent);
  });

  app.post('/api/consent', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.phone || !b.contactName || !b.channel || !b.purpose) {
      return res.status(400).json({ error: 'contactName, phone, channel, and purpose are required.' });
    }
    const now = new Date().toISOString();
    const rec = {
      id: newId('con'),
      leadId: b.leadId || null,
      customerId: b.customerId || null,
      contactName: String(b.contactName),
      phone: String(b.phone),
      channel: b.channel,
      purpose: b.purpose,
      status: b.status || 'granted',
      sourceProof: b.sourceProof || 'Manual CRM Verification',
      grantedAt: b.status === 'opted_out' || b.status === 'withdrawn' ? null : now,
      withdrawnAt: b.status === 'opted_out' || b.status === 'withdrawn' ? now : null,
      updatedAt: now,
    };
    db.consent.unshift(rec);
    saveDb();
    res.status(201).json(rec);
  });

  app.patch('/api/consent/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const rec = db.consent.find((c) => c.id === req.params.id);
    if (!rec) return res.status(404).json({ error: 'Consent record not found.' });
    const { status } = req.body ?? {};
    if (!['granted', 'withdrawn', 'opted_out'].includes(status)) {
      return res.status(400).json({ error: 'Invalid consent status.' });
    }
    const now = new Date().toISOString();
    rec.status = status;
    rec.updatedAt = now;

    if (status === 'withdrawn' || status === 'opted_out') {
      rec.withdrawnAt = now;
      // Mirror DB trigger: pause WhatsApp AI conversations & cancel automated follow-ups
      for (const conv of db.conversations) {
        if (
          conv.waPhone.replace(/\s+/g, '') === rec.phone.replace(/\s+/g, '') ||
          (rec.leadId && conv.leadId === rec.leadId)
        ) {
          conv.aiEnabled = false;
          conv.status = 'opted_out';
        }
      }
      if (rec.leadId) {
        for (const fu of db.followUps) {
          if (fu.leadId === rec.leadId && fu.isAutomated && fu.status === 'pending') {
            fu.status = 'cancelled';
          }
        }
      }
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'CONSENT_WITHDRAWN',
        entityType: 'consent',
        entityId: rec.id,
        details: { phone: rec.phone, status },
        ipAddress: req.ip || '127.0.0.1',
      });
    } else {
      rec.grantedAt = now;
      rec.withdrawnAt = null;
      for (const conv of db.conversations) {
        if (
          conv.waPhone.replace(/\s+/g, '') === rec.phone.replace(/\s+/g, '') ||
          (rec.leadId && conv.leadId === rec.leadId)
        ) {
          conv.status = 'open';
          conv.aiEnabled = true;
        }
      }
    }

    saveDb();
    res.json(rec);
  });

  // =========================================================================
  // 7. WHATSAPP BUSINESS & GEMINI AI CHATBOT
  // =========================================================================
  app.get('/api/whatsapp/conversations', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const list = db.conversations
      .filter((c) => {
        if (req.auth!.roleCode === 'sales_exec') return c.assignedTo === req.auth!.sub;
        return true;
      })
      .map((c) => {
        const lead = db.leads.find((l) => l.id === c.leadId);
        const msgs = db.messages.filter((m) => m.conversationId === c.id);
        return {
          ...c,
          leadName: lead?.fullName || 'Prospect',
          leadCode: lead?.leadCode || '',
          temperature: lead?.temperature || 'warm',
          optedOut: isContactOptedOut(c.waPhone, c.leadId),
          messages: msgs,
        };
      })
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

    res.json(list);
  });

  app.post('/api/whatsapp/incoming', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = getDb();
      const { leadId, phone, senderName, text, triggerAi = true } = req.body ?? {};
      if (!text || (!leadId && !phone)) {
        return res.status(400).json({ error: 'text and either leadId or phone are required.' });
      }

      let lead = leadId ? db.leads.find((l) => l.id === leadId) : undefined;
      if (!lead && phone) {
        const norm = String(phone).replace(/\s+/g, '');
        lead = db.leads.find((l) => l.phone.replace(/\s+/g, '') === norm);
      }

      const now = new Date().toISOString();
      if (!lead) {
        lead = {
          id: newId('lead'),
          leadCode: `AVS-2026-${114 + db.leads.length}`,
          fullName: senderName || 'WhatsApp Prospect',
          phone: String(phone),
          email: null,
          preferredLanguage: 'en',
          source: 'whatsapp',
          temperature: 'warm',
          stage: 'new',
          interestedCategory: 'apartment',
          transactionIntent: 'primary_sale',
          preferredCity: 'Bengaluru',
          preferredLocality: null,
          budgetMinInr: 10000000,
          budgetMaxInr: 25000000,
          projectId: null,
          assignedTo: req.auth!.sub,
          aiSummary: 'Auto-created from WhatsApp Business incoming message.',
          lastContactedAt: now,
          retentionExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
          createdAt: now,
          updatedAt: now,
        };
        db.leads.unshift(lead);
        db.consent.unshift({
          id: newId('con'),
          leadId: lead.id,
          customerId: null,
          contactName: lead.fullName,
          phone: lead.phone,
          channel: 'whatsapp',
          purpose: 'ai_chatbot',
          status: 'granted',
          sourceProof: 'WhatsApp Inbound Conversation Initiation',
          grantedAt: now,
          withdrawnAt: null,
          updatedAt: now,
        });
      }

      let conv = db.conversations.find((c) => c.leadId === lead!.id);
      if (!conv) {
        conv = {
          id: newId('conv'),
          leadId: lead.id,
          assignedTo: lead.assignedTo,
          channel: 'whatsapp',
          waPhone: lead.phone,
          detectedLanguage: lead.preferredLanguage || 'en',
          aiEnabled: true,
          status: 'open',
          lastMessageAt: now,
          createdAt: now,
        };
        db.conversations.unshift(conv);
      }

      const incomingText = String(text).trim();
      const inboundMsg = {
        id: newId('msg'),
        conversationId: conv.id,
        direction: 'inbound' as const,
        senderType: 'customer' as const,
        senderUserId: null,
        body: incomingText,
        languageCode: conv.detectedLanguage,
        waMessageId: `wamid.IN.${Date.now()}`,
        deliveryStatus: 'read' as const,
        createdAt: now,
      };
      db.messages.push(inboundMsg);
      conv.lastMessageAt = now;
      lead.lastContactedAt = now;

      // Keyword opt-out check (STOP / UNSUBSCRIBE / OPT OUT)
      const isOptOutKeyword = /^(stop|unsubscribe|opt\s*out|cancel)$/i.test(incomingText);
      if (isOptOutKeyword) {
        conv.aiEnabled = false;
        conv.status = 'opted_out';
        for (const c of db.consent) {
          if (c.leadId === lead.id || c.phone.replace(/\s+/g, '') === lead.phone.replace(/\s+/g, '')) {
            c.status = 'opted_out';
            c.withdrawnAt = now;
            c.updatedAt = now;
          }
        }
        const ackMsg = {
          id: newId('msg'),
          conversationId: conv.id,
          direction: 'outbound' as const,
          senderType: 'ai_bot' as const,
          senderUserId: null,
          body: 'You have been opted out from Avasa Realty WhatsApp updates immediately per DPDP preferences.',
          languageCode: 'en',
          waMessageId: `wamid.OPTOUT.${Date.now()}`,
          deliveryStatus: 'delivered' as const,
          createdAt: new Date().toISOString(),
        };
        db.messages.push(ackMsg);
        saveDb();
        writeAuditLog({
          actorUserId: req.auth!.sub,
          actorName: lead.fullName,
          actorRole: 'customer',
          action: 'CONSENT_WITHDRAWN',
          entityType: 'consent',
          entityId: lead.id,
          details: { keyword: incomingText, phone: lead.phone },
        });
        return res.status(201).json({ conversation: conv, inboundMsg, aiReplyMsg: ackMsg, optedOut: true });
      }

      let aiReplyMsg = null;
      let aiAnalysis = null;
      if (triggerAi && conv.aiEnabled && !isContactOptedOut(lead.phone, lead.id)) {
        const history = db.messages.filter((m) => m.conversationId === conv!.id);
        aiAnalysis = await generateRealEstateAiReply({
          customerName: lead.fullName,
          incomingMessage: incomingText,
          history,
          projects: db.projects,
          properties: db.properties,
          preferredLanguage: lead.preferredLanguage,
        });

        conv.detectedLanguage = aiAnalysis.detectedLanguage || conv.detectedLanguage;
        lead.preferredLanguage = aiAnalysis.detectedLanguage || lead.preferredLanguage;
        lead.temperature = aiAnalysis.suggestedTemperature || lead.temperature;
        if (aiAnalysis.suggestedCity) lead.preferredCity = aiAnalysis.suggestedCity;
        if (aiAnalysis.suggestedCategory) lead.interestedCategory = aiAnalysis.suggestedCategory;
        if (aiAnalysis.suggestedBudgetInr) lead.budgetMaxInr = aiAnalysis.suggestedBudgetInr;
        lead.aiSummary = `AI (${aiAnalysis.detectedLanguage}): Intent ${aiAnalysis.detectedIntent}. ${lead.aiSummary || ''}`.slice(0, 260);
        lead.updatedAt = new Date().toISOString();

        aiReplyMsg = {
          id: newId('msg'),
          conversationId: conv.id,
          direction: 'outbound' as const,
          senderType: 'ai_bot' as const,
          senderUserId: null,
          body: aiAnalysis.reply,
          languageCode: aiAnalysis.detectedLanguage || 'en',
          waMessageId: `wamid.AI.${Date.now()}`,
          deliveryStatus: 'delivered' as const,
          createdAt: new Date().toISOString(),
        };
        db.messages.push(aiReplyMsg);
        conv.lastMessageAt = aiReplyMsg.createdAt;
      }

      saveDb();
      res.status(201).json({ conversation: conv, inboundMsg, aiReplyMsg, aiAnalysis, optedOut: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI generation failed.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/whatsapp/outgoing', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const { conversationId, body } = req.body ?? {};
    if (!conversationId || !body) {
      return res.status(400).json({ error: 'conversationId and body are required.' });
    }
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

    if (req.auth!.roleCode === 'sales_exec' && conv.assignedTo !== req.auth!.sub) {
      return res.status(403).json({ error: 'Forbidden: Conversation belongs to another sales executive.' });
    }

    if (isContactOptedOut(conv.waPhone, conv.leadId) || conv.status === 'opted_out') {
      return res.status(403).json({
        error: 'Blocked: Contact has withdrawn consent or opted out of WhatsApp communications.',
      });
    }

    const now = new Date().toISOString();
    const msg = {
      id: newId('msg'),
      conversationId: conv.id,
      direction: 'outbound' as const,
      senderType: 'employee' as const,
      senderUserId: req.auth!.sub,
      body: String(body).trim(),
      languageCode: conv.detectedLanguage || 'en',
      waMessageId: `wamid.EMP.${Date.now()}`,
      deliveryStatus: 'delivered' as const,
      createdAt: now,
    };
    db.messages.push(msg);
    conv.lastMessageAt = now;
    saveDb();
    res.status(201).json(msg);
  });

  app.post('/api/ai/reply', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = getDb();
      const { conversationId, promptOverride } = req.body ?? {};
      const conv = db.conversations.find((c) => c.id === conversationId);
      if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
      const lead = db.leads.find((l) => l.id === conv.leadId);
      if (!lead) return res.status(404).json({ error: 'Lead not found.' });

      if (isContactOptedOut(conv.waPhone, conv.leadId)) {
        return res.status(403).json({ error: 'Blocked: Contact has opted out of AI/WhatsApp replies.' });
      }

      const history = db.messages.filter((m) => m.conversationId === conv.id);
      const lastInbound = [...history].reverse().find((m) => m.direction === 'inbound');
      const queryText = promptOverride || lastInbound?.body || 'Please share available property options.';

      const analysis = await generateRealEstateAiReply({
        customerName: lead.fullName,
        incomingMessage: queryText,
        history,
        projects: db.projects,
        properties: db.properties,
        preferredLanguage: lead.preferredLanguage,
      });

      const msg = {
        id: newId('msg'),
        conversationId: conv.id,
        direction: 'outbound' as const,
        senderType: 'ai_bot' as const,
        senderUserId: null,
        body: analysis.reply,
        languageCode: analysis.detectedLanguage || 'en',
        waMessageId: `wamid.AI.${Date.now()}`,
        deliveryStatus: 'delivered' as const,
        createdAt: new Date().toISOString(),
      };
      db.messages.push(msg);
      conv.lastMessageAt = msg.createdAt;
      conv.detectedLanguage = analysis.detectedLanguage || conv.detectedLanguage;
      saveDb();

      res.status(201).json({ message: msg, analysis });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'AI Assistant error.';
      res.status(502).json({ error: message });
    }
  });

  // =========================================================================
  // 8. SITE VISITS & FOLLOW-UPS
  // =========================================================================
  app.get('/api/site-visits', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const list = db.siteVisits.filter((v) =>
      req.auth!.roleCode === 'sales_exec' ? v.assignedTo === req.auth!.sub : true
    );
    res.json(list);
  });

  app.post('/api/site-visits', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.leadId || !b.projectId || !b.scheduledAt) {
      return res.status(400).json({ error: 'leadId, projectId, and scheduledAt are required.' });
    }
    const lead = db.leads.find((l) => l.id === b.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    const visit = {
      id: newId('sv'),
      leadId: b.leadId,
      projectId: b.projectId,
      propertyId: b.propertyId || null,
      assignedTo: b.assignedTo || lead.assignedTo || req.auth!.sub,
      scheduledAt: b.scheduledAt,
      completedAt: null,
      status: 'scheduled' as const,
      pickupRequired: Boolean(b.pickupRequired),
      feedback: null,
      rating: null,
      createdAt: new Date().toISOString(),
    };
    db.siteVisits.unshift(visit);
    if (lead.stage === 'new' || lead.stage === 'contacted' || lead.stage === 'qualified') {
      lead.stage = 'site_visit_scheduled';
    }
    saveDb();
    res.status(201).json(visit);
  });

  app.patch('/api/site-visits/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const visit = db.siteVisits.find((v) => v.id === req.params.id);
    if (!visit) return res.status(404).json({ error: 'Site visit not found.' });
    if (req.auth!.roleCode === 'sales_exec' && visit.assignedTo !== req.auth!.sub) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    if (req.body.status) {
      visit.status = req.body.status;
      if (req.body.status === 'completed') {
        visit.completedAt = new Date().toISOString();
        const lead = db.leads.find((l) => l.id === visit.leadId);
        if (lead && lead.stage !== 'booked') lead.stage = 'site_visit_done';
      }
    }
    if (req.body.feedback !== undefined) visit.feedback = req.body.feedback;
    if (req.body.rating !== undefined) visit.rating = Number(req.body.rating);
    saveDb();
    res.json(visit);
  });

  app.get('/api/follow-ups', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const list = db.followUps.filter((f) =>
      req.auth!.roleCode === 'sales_exec' ? f.assignedTo === req.auth!.sub : true
    );
    res.json(list);
  });

  app.post('/api/follow-ups', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.leadId || !b.dueAt || !b.notes) {
      return res.status(400).json({ error: 'leadId, dueAt, and notes are required.' });
    }
    const fu = {
      id: newId('fu'),
      leadId: b.leadId,
      assignedTo: b.assignedTo || req.auth!.sub,
      channel: b.channel || 'call',
      dueAt: b.dueAt,
      notes: String(b.notes),
      isAutomated: Boolean(b.isAutomated),
      status: 'pending' as const,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.followUps.unshift(fu);
    saveDb();
    res.status(201).json(fu);
  });

  app.patch('/api/follow-ups/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const fu = db.followUps.find((f) => f.id === req.params.id);
    if (!fu) return res.status(404).json({ error: 'Follow-up not found.' });
    if (req.body.status) {
      fu.status = req.body.status;
      if (req.body.status === 'completed') fu.completedAt = new Date().toISOString();
    }
    saveDb();
    res.json(fu);
  });

  // =========================================================================
  // 9. BOOKINGS, PAYMENTS & COMMISSIONS
  // =========================================================================
  app.get('/api/bookings', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const list = db.bookings.filter((b) =>
      req.auth!.roleCode === 'sales_exec' ? b.closedBy === req.auth!.sub : true
    );
    res.json(list);
  });

  app.post('/api/bookings', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.leadId || !b.propertyId || !b.agreementValueInr) {
      return res.status(400).json({ error: 'leadId, propertyId, and agreementValueInr are required.' });
    }
    const lead = db.leads.find((l) => l.id === b.leadId);
    const prop = db.properties.find((p) => p.id === b.propertyId);
    if (!lead || !prop) return res.status(404).json({ error: 'Lead or property not found.' });
    if (prop.status !== 'available' && prop.status !== 'reserved') {
      return res.status(400).json({ error: `Property ${prop.unitCode} is already ${prop.status}.` });
    }

    const now = new Date().toISOString();
    // Ensure customer profile exists
    let customer = db.customers.find((c) => c.leadId === lead.id);
    if (!customer) {
      customer = {
        id: newId('cust'),
        leadId: lead.id,
        assignedTo: lead.assignedTo || req.auth!.sub,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email || `${lead.leadCode.toLowerCase()}@client.in`,
        panMasked: b.panMasked || 'PANPK****1A',
        city: lead.preferredCity,
        correspondenceAddress: b.correspondenceAddress || `${lead.preferredCity}, India`,
        kycVerified: true,
        createdAt: now,
      };
      db.customers.unshift(customer);
    }

    const agreementValueInr = Number(b.agreementValueInr);
    const gstRate = prop.category === 'commercial' ? 0.12 : prop.category === 'plot_land' ? 0 : 0.05;
    const gstAmountInr = b.gstAmountInr !== undefined ? Number(b.gstAmountInr) : Math.round(agreementValueInr * gstRate);
    const totalPayableInr = agreementValueInr + gstAmountInr;
    const closedBy = lead.assignedTo || req.auth!.sub;

    const booking = {
      id: newId('bk'),
      bookingCode: `BK-IND-2026-${db.bookings.length + 10}`,
      leadId: lead.id,
      customerId: customer.id,
      projectId: prop.projectId || lead.projectId || db.projects[0].id,
      propertyId: prop.id,
      closedBy,
      agreementValueInr,
      gstAmountInr,
      totalPayableInr,
      bookingDate: formatIstDate(new Date()),
      status: 'confirmed' as const,
      retentionUntil: '2034-11-17',
      createdAt: now,
    };
    db.bookings.unshift(booking);

    prop.status = 'booked';
    lead.stage = 'booked';
    lead.updatedAt = now;

    if (prop.projectId) {
      const prj = db.projects.find((p) => p.id === prop.projectId);
      if (prj && prj.availableUnits > 0) prj.availableUnits -= 1;
    }

    // Create 20% Token payment + 80% Balance milestone
    const tokenAmt = Math.round(totalPayableInr * 0.2);
    db.payments.unshift(
      {
        id: newId('pay'),
        bookingId: booking.id,
        milestoneName: 'Balance Agreement & Possession (80%)',
        amountInr: totalPayableInr - tokenAmt,
        dueDate: formatIstDate(new Date(Date.now() + 30 * 86400000)),
        paidDate: null,
        paymentMode: null,
        utrReference: null,
        status: 'pending',
        createdAt: now,
      },
      {
        id: newId('pay'),
        bookingId: booking.id,
        milestoneName: 'Booking Token (20%)',
        amountInr: tokenAmt,
        dueDate: formatIstDate(new Date()),
        paidDate: b.tokenPaid ? formatIstDate(new Date()) : null,
        paymentMode: b.tokenPaid ? b.paymentMode || 'neft_rtgs' : null,
        utrReference: b.tokenPaid ? b.utrReference || `UTR${Date.now()}` : null,
        status: b.tokenPaid ? 'paid' : 'pending',
        createdAt: now,
      }
    );

    // Create sales commission record (with 5% Sec 194H TDS)
    const emp = db.users.find((u) => u.id === closedBy);
    const rate = emp?.commissionRatePct || 1.5;
    const gross = Math.round((agreementValueInr * rate) / 100);
    const tds = Math.round(gross * 0.05);
    db.commissions.unshift({
      id: newId('com'),
      bookingId: booking.id,
      employeeId: closedBy,
      commissionRatePct: rate,
      grossAmountInr: gross,
      tdsDeductedInr: tds,
      netPayableInr: gross - tds,
      status: 'pending',
      approvedBy: null,
      paidAt: null,
      createdAt: now,
    });

    saveDb();
    writeAuditLog({
      actorUserId: req.auth!.sub,
      actorName: req.auth!.fullName,
      actorRole: req.auth!.roleCode,
      action: 'BOOKING_CREATED',
      entityType: 'bookings',
      entityId: booking.id,
      details: { bookingCode: booking.bookingCode, totalPayableInr },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(201).json(booking);
  });

  app.get('/api/payments', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    if (req.auth!.roleCode === 'sales_exec') {
      const myBookingIds = new Set(
        db.bookings.filter((b) => b.closedBy === req.auth!.sub).map((b) => b.id)
      );
      return res.json(db.payments.filter((p) => myBookingIds.has(p.bookingId)));
    }
    res.json(db.payments);
  });

  app.patch(
    '/api/payments/:id',
    requireAuth,
    requireRoles('admin', 'finance', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const pay = db.payments.find((p) => p.id === req.params.id);
      if (!pay) return res.status(404).json({ error: 'Payment not found.' });
      if (req.body.status) pay.status = req.body.status;
      if (req.body.paymentMode) pay.paymentMode = req.body.paymentMode;
      if (req.body.utrReference) pay.utrReference = req.body.utrReference;
      if (req.body.status === 'paid') pay.paidDate = formatIstDate(new Date());
      saveDb();
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'PAYMENT_UPDATED',
        entityType: 'payments',
        entityId: pay.id,
        details: { status: pay.status, utrReference: pay.utrReference },
        ipAddress: req.ip || '127.0.0.1',
      });
      res.json(pay);
    }
  );

  app.get('/api/commissions', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const list = db.commissions.filter((c) =>
      req.auth!.roleCode === 'sales_exec' ? c.employeeId === req.auth!.sub : true
    );
    res.json(list);
  });

  app.patch(
    '/api/commissions/:id',
    requireAuth,
    requireRoles('admin', 'finance'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const com = db.commissions.find((c) => c.id === req.params.id);
      if (!com) return res.status(404).json({ error: 'Commission not found.' });
      if (req.body.status) {
        com.status = req.body.status;
        if (req.body.status === 'approved') com.approvedBy = req.auth!.sub;
        if (req.body.status === 'paid') {
          com.approvedBy = com.approvedBy || req.auth!.sub;
          com.paidAt = new Date().toISOString();
        }
      }
      saveDb();
      res.json(com);
    }
  );

  // =========================================================================
  // 9B. GST BILLING INVOICES & ADVANCE TOKEN RECEIPTS
  // =========================================================================
  app.get('/api/invoices', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    if (req.auth!.roleCode === 'sales_exec') {
      const uid = req.auth!.sub;
      const myBookingIds = new Set(db.bookings.filter((b) => b.closedBy === uid).map((b) => b.id));
      const myLeadIds = new Set(db.leads.filter((l) => l.assignedTo === uid).map((l) => l.id));
      return res.json(
        db.invoices.filter(
          (inv) =>
            inv.createdBy === uid ||
            (inv.bookingId && myBookingIds.has(inv.bookingId)) ||
            (inv.leadId && myLeadIds.has(inv.leadId))
        )
      );
    }
    res.json(db.invoices);
  });

  app.post('/api/invoices', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    const rawItems = Array.isArray(b.lineItems) ? b.lineItems : [];
    const lineItems: InvoiceLineItem[] = rawItems
      .filter((item: unknown) => item && typeof item === 'object')
      .map((item: Record<string, unknown>) => ({
        description: String(item.description || '').trim(),
        sacCode: String(item.sacCode || '995411').trim(),
        amountInr: Math.max(0, Math.round(Number(item.amountInr) || 0)),
      }))
      .filter((item: InvoiceLineItem) => item.description && item.amountInr > 0);

    if (!b.billedToName || !b.billedToPhone || lineItems.length === 0) {
      return res.status(400).json({
        error: 'billedToName, billedToPhone, and at least one valid lineItem are required.',
      });
    }

    const subtotalInr = lineItems.reduce((sum, item) => sum + item.amountInr, 0);
    const cgstRatePct = Number(b.cgstRatePct ?? 2.5);
    const sgstRatePct = Number(b.sgstRatePct ?? 2.5);
    const cgstAmountInr = Math.round((subtotalInr * cgstRatePct) / 100);
    const sgstAmountInr = Math.round((subtotalInr * sgstRatePct) / 100);
    const totalAmountInr = subtotalInr + cgstAmountInr + sgstAmountInr;
    const paidAmountInr = Math.min(totalAmountInr, Math.max(0, Math.round(Number(b.paidAmountInr) || 0)));

    let status: InvoiceRecord['status'] = b.status === 'draft' ? 'draft' : 'issued';
    if (paidAmountInr >= totalAmountInr && totalAmountInr > 0) {
      status = 'paid';
    } else if (paidAmountInr > 0) {
      status = 'partially_paid';
    }

    const now = new Date().toISOString();
    const invoice: InvoiceRecord = {
      id: newId('inv'),
      invoiceNumber: `INV-AVS-2026-${String(db.invoices.length + 1).padStart(3, '0')}`,
      bookingId: b.bookingId || null,
      customerId: b.customerId || null,
      leadId: b.leadId || null,
      projectId: b.projectId || null,
      propertyId: b.propertyId || null,
      billedToName: String(b.billedToName).trim(),
      billedToPhone: String(b.billedToPhone).trim(),
      billedToAddress: String(b.billedToAddress || 'India').trim(),
      buyerGstOrPan: String(b.buyerGstOrPan || 'UNREGISTERED').trim().toUpperCase(),
      billCategory: b.billCategory || 'booking_milestone',
      lineItems,
      subtotalInr,
      cgstRatePct,
      sgstRatePct,
      cgstAmountInr,
      sgstAmountInr,
      totalAmountInr,
      paidAmountInr,
      issueDate: b.issueDate || formatIstDate(new Date()),
      dueDate: b.dueDate || formatIstDate(new Date(Date.now() + 10 * 86400000)),
      status,
      notes: b.notes ? String(b.notes).trim() : null,
      createdBy: req.auth!.sub,
      createdAt: now,
    };

    db.invoices.unshift(invoice);
    saveDb();

    writeAuditLog({
      actorUserId: req.auth!.sub,
      actorName: req.auth!.fullName,
      actorRole: req.auth!.roleCode,
      action: 'INVOICE_CREATED',
      entityType: 'invoices',
      entityId: invoice.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmountInr: invoice.totalAmountInr,
        billCategory: invoice.billCategory,
      },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(201).json(invoice);
  });

  app.patch(
    '/api/invoices/:id',
    requireAuth,
    requireRoles('admin', 'finance', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const inv = db.invoices.find((i) => i.id === req.params.id);
      if (!inv) return res.status(404).json({ error: 'Invoice not found.' });

      const b = req.body ?? {};
      if (b.addPaymentInr !== undefined) {
        const added = Math.max(0, Math.round(Number(b.addPaymentInr) || 0));
        inv.paidAmountInr = Math.min(inv.totalAmountInr, inv.paidAmountInr + added);
        if (inv.paidAmountInr >= inv.totalAmountInr) {
          inv.status = 'paid';
        } else if (inv.paidAmountInr > 0) {
          inv.status = 'partially_paid';
        }
      }
      if (b.status && ['draft', 'issued', 'partially_paid', 'paid', 'cancelled'].includes(b.status)) {
        inv.status = b.status;
        if (b.status === 'paid') {
          inv.paidAmountInr = inv.totalAmountInr;
        }
      }
      if (b.notes !== undefined) {
        inv.notes = b.notes ? String(b.notes).trim() : null;
      }

      saveDb();
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'INVOICE_UPDATED',
        entityType: 'invoices',
        entityId: inv.id,
        details: {
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          paidAmountInr: inv.paidAmountInr,
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json(inv);
    }
  );

  app.get('/api/token-receipts', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    if (req.auth!.roleCode === 'sales_exec') {
      const uid = req.auth!.sub;
      const myLeadIds = new Set(db.leads.filter((l) => l.assignedTo === uid).map((l) => l.id));
      return res.json(
        db.advanceTokenReceipts.filter(
          (r) => r.receivedBy === uid || (r.leadId && myLeadIds.has(r.leadId))
        )
      );
    }
    res.json(db.advanceTokenReceipts);
  });

  app.post('/api/token-receipts', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const b = req.body ?? {};
    const tokenAmountInr = Math.round(Number(b.tokenAmountInr) || 0);
    if (!b.payerName || !b.payerPhone || tokenAmountInr <= 0 || !b.referenceNumber) {
      return res.status(400).json({
        error: 'payerName, payerPhone, positive tokenAmountInr, and referenceNumber are required.',
      });
    }

    let unitReserved = false;
    if (b.propertyId && b.reserveUnit) {
      const prop = db.properties.find((p) => p.id === b.propertyId);
      if (!prop) return res.status(404).json({ error: 'Selected property unit not found.' });
      if (prop.status === 'booked') {
        return res.status(400).json({ error: `Unit ${prop.unitCode} is already booked.` });
      }
      prop.status = 'reserved';
      unitReserved = true;
    }

    const now = new Date().toISOString();
    const receipt: AdvanceTokenReceiptRecord = {
      id: newId('tok'),
      receiptNumber: `RCPT-TOK-2026-${String(db.advanceTokenReceipts.length + 1).padStart(3, '0')}`,
      leadId: b.leadId || null,
      customerId: b.customerId || null,
      projectId: b.projectId || null,
      propertyId: b.propertyId || null,
      payerName: String(b.payerName).trim(),
      payerPhone: String(b.payerPhone).trim(),
      payerEmail: b.payerEmail ? String(b.payerEmail).trim() : null,
      panMasked: String(b.panMasked || 'XXXXX****X').trim().toUpperCase(),
      purpose: b.purpose || 'booking_token',
      tokenAmountInr,
      paymentMode: b.paymentMode || 'upi',
      referenceNumber: String(b.referenceNumber).trim(),
      bankName: String(b.bankName || 'HDFC Bank').trim(),
      receiptDate: b.receiptDate || formatIstDate(new Date()),
      validUntilDate: b.validUntilDate || formatIstDate(new Date(Date.now() + 15 * 86400000)),
      unitReserved,
      status: b.status === 'cleared' ? 'cleared' : 'received',
      remarks: b.remarks ? String(b.remarks).trim() : null,
      receivedBy: req.auth!.sub,
      createdAt: now,
    };

    db.advanceTokenReceipts.unshift(receipt);
    saveDb();

    writeAuditLog({
      actorUserId: req.auth!.sub,
      actorName: req.auth!.fullName,
      actorRole: req.auth!.roleCode,
      action: 'TOKEN_RECEIPT_ISSUED',
      entityType: 'advance_token_receipts',
      entityId: receipt.id,
      details: {
        receiptNumber: receipt.receiptNumber,
        tokenAmountInr: receipt.tokenAmountInr,
        unitReserved: receipt.unitReserved,
        propertyId: receipt.propertyId,
      },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(201).json(receipt);
  });

  app.patch(
    '/api/token-receipts/:id',
    requireAuth,
    requireRoles('admin', 'finance', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const receipt = db.advanceTokenReceipts.find((r) => r.id === req.params.id);
      if (!receipt) return res.status(404).json({ error: 'Advance token receipt not found.' });

      const b = req.body ?? {};
      if (b.status && ['received', 'cleared', 'adjusted_to_booking', 'refunded'].includes(b.status)) {
        receipt.status = b.status;
        if (b.status === 'refunded' && receipt.unitReserved && receipt.propertyId) {
          const prop = db.properties.find((p) => p.id === receipt.propertyId);
          if (prop && prop.status === 'reserved') {
            prop.status = 'available';
          }
          receipt.unitReserved = false;
        }
      }
      if (b.remarks !== undefined) {
        receipt.remarks = b.remarks ? String(b.remarks).trim() : null;
      }

      saveDb();
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'TOKEN_RECEIPT_UPDATED',
        entityType: 'advance_token_receipts',
        entityId: receipt.id,
        details: {
          receiptNumber: receipt.receiptNumber,
          status: receipt.status,
          unitReserved: receipt.unitReserved,
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json(receipt);
    }
  );

  // =========================================================================
  // 10. MARKETING CAMPAIGNS (WITH CONSENT ENFORCEMENT)
  // =========================================================================
  app.get('/api/campaigns', requireAuth, (_req, res) => {
    res.json(getDb().campaigns);
  });

  app.post(
    '/api/campaigns',
    requireAuth,
    requireRoles('admin', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.name || !b.templateMessage) {
        return res.status(400).json({ error: 'name and templateMessage are required.' });
      }
      const campaign = {
        id: newId('cmp'),
        name: String(b.name),
        channel: b.channel || 'whatsapp',
        targetTemperature: b.targetTemperature || 'all',
        targetCity: b.targetCity || null,
        projectId: b.projectId || null,
        templateMessage: String(b.templateMessage),
        languageCode: b.languageCode || 'en',
        status: 'draft' as const,
        sentCount: 0,
        skippedOptOutCount: 0,
        createdBy: req.auth!.sub,
        lastRunAt: null,
        createdAt: new Date().toISOString(),
      };
      db.campaigns.unshift(campaign);
      saveDb();
      res.status(201).json(campaign);
    }
  );

  app.post(
    '/api/campaigns/:id/run',
    requireAuth,
    requireRoles('admin', 'sales_manager'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const cmp = db.campaigns.find((c) => c.id === req.params.id);
      if (!cmp) return res.status(404).json({ error: 'Campaign not found.' });

      const matchingLeads = db.leads.filter((l) => {
        if (cmp.targetTemperature !== 'all' && l.temperature !== cmp.targetTemperature) return false;
        if (cmp.targetCity && l.preferredCity.toLowerCase() !== cmp.targetCity.toLowerCase()) return false;
        return true;
      });

      let sent = 0;
      let skipped = 0;
      for (const l of matchingLeads) {
        if (isContactOptedOut(l.phone, l.id)) {
          skipped += 1;
        } else {
          sent += 1;
        }
      }
      cmp.sentCount = sent;
      cmp.skippedOptOutCount = skipped;
      cmp.status = 'completed';
      cmp.lastRunAt = new Date().toISOString();
      saveDb();

      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'CAMPAIGN_EXECUTED',
        entityType: 'campaigns',
        entityId: cmp.id,
        details: { sentCount: sent, skippedOptOutCount: skipped },
        ipAddress: req.ip || '127.0.0.1',
      });
      res.json(cmp);
    }
  );

  // =========================================================================
  // 11. EMPLOYEES, ROLES, AUDIT LOGS & REPORTS
  // =========================================================================
  app.get('/api/employees', requireAuth, (_req, res) => {
    const db = getDb();
    res.json(db.users.map(stripPassword));
  });

  app.post(
    '/api/employees',
    requireAuth,
    requireRoles('admin'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.fullName || !b.email || !b.phone || !b.roleCode) {
        return res.status(400).json({ error: 'fullName, email, phone, and roleCode are required.' });
      }
      if (db.users.some((u) => u.email.toLowerCase() === String(b.email).toLowerCase())) {
        return res.status(409).json({ error: 'Employee email already exists.' });
      }
      const role = db.roles.find((r) => r.code === b.roleCode);
      if (!role) return res.status(400).json({ error: 'Invalid roleCode.' });

      const user = {
        id: newId('usr'),
        roleId: role.id,
        roleCode: role.code,
        roleName: role.name,
        fullName: String(b.fullName),
        email: String(b.email).toLowerCase(),
        phone: String(b.phone),
        city: b.city || 'Bengaluru',
        monthlyTargetInr: Number(b.monthlyTargetInr) || 25000000,
        commissionRatePct: Number(b.commissionRatePct) || 1.5,
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        passwordHash: hashPassword(b.password || 'Avasa@2026!'),
      };
      db.users.push(user);
      saveDb();
      writeAuditLog({
        actorUserId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.roleCode,
        action: 'EMPLOYEE_CREATED',
        entityType: 'users',
        entityId: user.id,
        details: { email: user.email, role: user.roleCode },
        ipAddress: req.ip || '127.0.0.1',
      });
      res.status(201).json(stripPassword(user));
    }
  );

  app.get('/api/roles', requireAuth, (_req, res) => {
    const db = getDb();
    res.json({
      roles: db.roles,
      permissions: db.permissions,
      rolePermissions: db.rolePermissions,
    });
  });

  app.get('/api/audit-logs', requireAuth, requireRoles('admin'), (_req, res) => {
    res.json(getDb().auditLogs);
  });

  app.get('/api/reports/export', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const accessibleLeads = db.leads.filter((l) =>
      canAccessLead(req.auth!.sub, req.auth!.roleCode, l)
    );
    const header =
      'Lead Code,Name,Phone,City,Category,Transaction,Source,Temperature,Stage,Max Budget INR,Created At\n';
    const rows = accessibleLeads
      .map(
        (l) =>
          `"${l.leadCode}","${l.fullName}","${l.phone}","${l.preferredCity}","${l.interestedCategory}","${l.transactionIntent}","${l.source}","${l.temperature}","${l.stage}",${l.budgetMaxInr},"${l.createdAt}"`
      )
      .join('\n');

    writeAuditLog({
      actorUserId: req.auth!.sub,
      actorName: req.auth!.fullName,
      actorRole: req.auth!.roleCode,
      action: 'REPORT_CSV_EXPORTED',
      entityType: 'leads',
      details: { rowCount: accessibleLeads.length },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="avasa_leads_report.csv"');
    res.send(header + rows);
  });

  // =========================================================================
  // 12. SAMPLE SQL FILES, DATABASE BACKUPS & DOCUMENTATION
  // =========================================================================
  app.get('/api/database/sql/:file', requireAuth, (req, res) => {
    const allowed = ['001_schema.sql', '002_rls_and_indexes.sql', '003_seed_data.sql'];
    const file = req.params.file;
    if (!allowed.includes(file)) {
      return res.status(404).json({ error: 'SQL file not found.' });
    }
    const fullPath = path.resolve(process.cwd(), 'database', file);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'SQL migration missing on disk.' });
    }
    res.json({ filename: file, sql: fs.readFileSync(fullPath, 'utf8') });
  });

  app.get('/api/database/tables/:table', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const role = req.auth!.roleCode;
    const uid = req.auth!.sub;
    const table = req.params.table;

    const tableData: Record<string, () => unknown[]> = {
      roles: () => db.roles,
      permissions: () => db.permissions,
      users: () => db.users.map(stripPassword),
      projects: () => db.projects,
      properties: () => db.properties,
      leads: () => db.leads.filter((l) => canAccessLead(uid, role, l)),
      customers: () => db.customers.filter((c) => canAccessCustomer(uid, role, c)),
      consent: () =>
        role === 'sales_exec'
          ? db.consent.filter((c) => db.leads.some((l) => l.id === c.leadId && l.assignedTo === uid))
          : db.consent,
      conversations: () =>
        role === 'sales_exec' ? db.conversations.filter((c) => c.assignedTo === uid) : db.conversations,
      messages: () => {
        if (role !== 'sales_exec') return db.messages;
        const allowedConvs = new Set(
          db.conversations.filter((c) => c.assignedTo === uid).map((c) => c.id)
        );
        return db.messages.filter((m) => allowedConvs.has(m.conversationId));
      },
      site_visits: () =>
        role === 'sales_exec' ? db.siteVisits.filter((v) => v.assignedTo === uid) : db.siteVisits,
      bookings: () =>
        role === 'sales_exec' ? db.bookings.filter((b) => b.closedBy === uid) : db.bookings,
      payments: () => {
        if (role !== 'sales_exec') return db.payments;
        const allowedBk = new Set(db.bookings.filter((b) => b.closedBy === uid).map((b) => b.id));
        return db.payments.filter((p) => allowedBk.has(p.bookingId));
      },
      commissions: () =>
        role === 'sales_exec' ? db.commissions.filter((c) => c.employeeId === uid) : db.commissions,
      follow_ups: () =>
        role === 'sales_exec' ? db.followUps.filter((f) => f.assignedTo === uid) : db.followUps,
      campaigns: () => db.campaigns,
      invoices: () =>
        role === 'sales_exec'
          ? db.invoices.filter((i) => i.createdBy === uid)
          : db.invoices,
      advance_token_receipts: () =>
        role === 'sales_exec'
          ? db.advanceTokenReceipts.filter((r) => r.receivedBy === uid)
          : db.advanceTokenReceipts,
      audit_logs: () => (role === 'admin' ? db.auditLogs : []),
    };

    const resolver = tableData[table];
    if (!resolver) {
      return res.status(404).json({ error: `Unknown table '${table}'.` });
    }
    const rows = resolver();
    res.json({
      table,
      rowCount: rows.length,
      rlsScoped: role === 'sales_exec',
      rows: rows.slice(0, 25),
    });
  });

  app.post(
    '/api/database/backup',
    requireAuth,
    requireRoles('admin'),
    (req: AuthenticatedRequest, res) => {
      const result = createDatabaseBackup(
        req.auth!.sub,
        req.auth!.fullName,
        req.auth!.roleCode
      );
      res.status(201).json(result);
    }
  );

  app.get('/api/docs', requireAuth, (_req, res) => {
    res.json(CRM_DOCUMENTATION);
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Avasa Realty CRM server listening on http://0.0.0.0:${PORT} (IST)`);
  });
}

// Start HTTP server only when executed directly (allows integration tests to import createApp)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  startServer();
}
