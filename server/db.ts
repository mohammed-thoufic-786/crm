import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { hashPassword } from './auth.ts';
import type {
  AuditLogRecord,
  BookingRecord,
  CampaignRecord,
  CommissionRecord,
  ConsentRecord,
  ConversationRecord,
  CustomerRecord,
  DashboardMetrics,
  FollowUpRecord,
  LeadRecord,
  MessageRecord,
  PaymentRecord,
  PermissionRecord,
  ProjectRecord,
  PropertyRecord,
  RoleCode,
  RoleRecord,
  SiteVisitRecord,
  UserRecord,
} from '../src/types.ts';

export interface StoredUser extends UserRecord {
  passwordHash: string;
}

export interface CrmDatabase {
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  rolePermissions: Record<RoleCode, string[]>;
  users: StoredUser[];
  projects: ProjectRecord[];
  properties: PropertyRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  consent: ConsentRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  siteVisits: SiteVisitRecord[];
  bookings: BookingRecord[];
  payments: PaymentRecord[];
  commissions: CommissionRecord[];
  followUps: FollowUpRecord[];
  campaigns: CampaignRecord[];
  auditLogs: AuditLogRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'crm-db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export function formatIstDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function daysAgoIso(days: number, hourIst = 10): string {
  const d = new Date(Date.now() - days * 86400000);
  d.setUTCHours(hourIst - 5, 30, 0, 0);
  return d.toISOString();
}

function daysAheadIso(days: number, hourIst = 11): string {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hourIst - 5, 30, 0, 0);
  return d.toISOString();
}

function buildSeedDatabase(): CrmDatabase {
  const defaultPwdHash = hashPassword('Avasa@2026!');

  const roles: RoleRecord[] = [
    { id: 1, code: 'admin', name: 'Company Admin', description: 'Full platform governance, RBAC, backups, audit logs, and all customer PII' },
    { id: 2, code: 'sales_manager', name: 'Sales Manager', description: 'Team pipeline oversight, lead assignment, site visits, and marketing campaigns' },
    { id: 3, code: 'sales_exec', name: 'Sales Executive', description: 'Row-level restricted to assigned leads, assigned customers, site visits, and own commissions' },
    { id: 4, code: 'finance', name: 'Accounts & Finance', description: 'Booking ledger, INR milestone collections, GST verification, and commission disbursements' },
  ];

  const permissions: PermissionRecord[] = [
    { id: 1, code: 'dashboard:view_all', module: 'dashboard', description: 'View company-wide analytics across all employees' },
    { id: 2, code: 'leads:read_all', module: 'leads', description: 'Read all leads across organization' },
    { id: 3, code: 'leads:read_assigned', module: 'leads', description: 'Read only leads assigned to current user' },
    { id: 4, code: 'leads:assign', module: 'leads', description: 'Assign or reassign leads to sales executives' },
    { id: 5, code: 'customers:read_pii', module: 'customers', description: 'Access customer KYC, phone, email, and masked PAN' },
    { id: 6, code: 'properties:manage', module: 'properties', description: 'Create and update development projects and property units' },
    { id: 7, code: 'whatsapp:reply', module: 'whatsapp', description: 'Send WhatsApp messages and invoke AI assistant' },
    { id: 8, code: 'bookings:manage', module: 'bookings', description: 'Create bookings and reserve inventory' },
    { id: 9, code: 'payments:manage', module: 'payments', description: 'Record INR payments and approve sales commissions' },
    { id: 10, code: 'security:audit', module: 'security', description: 'View audit logs, manage employees, and trigger backups' },
  ];

  const rolePermissions: Record<RoleCode, string[]> = {
    admin: permissions.map((p) => p.code),
    sales_manager: ['dashboard:view_all', 'leads:read_all', 'leads:assign', 'customers:read_pii', 'properties:manage', 'whatsapp:reply', 'bookings:manage'],
    sales_exec: ['leads:read_assigned', 'whatsapp:reply', 'bookings:manage'],
    finance: ['dashboard:view_all', 'customers:read_pii', 'bookings:manage', 'payments:manage'],
  };

  const users: StoredUser[] = [
    {
      id: 'usr-admin-01',
      roleId: 1,
      roleCode: 'admin',
      roleName: 'Company Admin',
      fullName: 'Vikramaditya Rao',
      email: 'admin@avasarealty.in',
      phone: '+91 98450 11001',
      city: 'Bengaluru',
      monthlyTargetInr: 0,
      commissionRatePct: 0,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 9),
      createdAt: daysAgoIso(180),
      passwordHash: defaultPwdHash,
    },
    {
      id: 'usr-mgr-01',
      roleId: 2,
      roleCode: 'sales_manager',
      roleName: 'Sales Manager',
      fullName: 'Meenakshi Iyer',
      email: 'manager@avasarealty.in',
      phone: '+91 98450 11002',
      city: 'Bengaluru',
      monthlyTargetInr: 60000000,
      commissionRatePct: 0.75,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 10),
      createdAt: daysAgoIso(170),
      passwordHash: defaultPwdHash,
    },
    {
      id: 'usr-exec-01',
      roleId: 3,
      roleCode: 'sales_exec',
      roleName: 'Sales Executive',
      fullName: 'Arjun Deshmukh',
      email: 'arjun@avasarealty.in',
      phone: '+91 98201 44210',
      city: 'Bengaluru',
      monthlyTargetInr: 35000000,
      commissionRatePct: 1.5,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 11),
      createdAt: daysAgoIso(150),
      passwordHash: defaultPwdHash,
    },
    {
      id: 'usr-exec-02',
      roleId: 3,
      roleCode: 'sales_exec',
      roleName: 'Sales Executive',
      fullName: 'Priya Nair',
      email: 'priya@avasarealty.in',
      phone: '+91 98490 77812',
      city: 'Hyderabad',
      monthlyTargetInr: 35000000,
      commissionRatePct: 1.5,
      isActive: true,
      lastLoginAt: daysAgoIso(1, 14),
      createdAt: daysAgoIso(140),
      passwordHash: defaultPwdHash,
    },
    {
      id: 'usr-exec-03',
      roleId: 3,
      roleCode: 'sales_exec',
      roleName: 'Sales Executive',
      fullName: 'Rohan Malhotra',
      email: 'rohan@avasarealty.in',
      phone: '+91 98111 33490',
      city: 'Gurugram',
      monthlyTargetInr: 40000000,
      commissionRatePct: 1.75,
      isActive: true,
      lastLoginAt: daysAgoIso(1, 16),
      createdAt: daysAgoIso(135),
      passwordHash: defaultPwdHash,
    },
    {
      id: 'usr-exec-04',
      roleId: 3,
      roleCode: 'sales_exec',
      roleName: 'Sales Executive',
      fullName: 'Sneha Kulkarni',
      email: 'sneha@avasarealty.in',
      phone: '+91 98220 55891',
      city: 'Pune',
      monthlyTargetInr: 25000000,
      commissionRatePct: 1.5,
      isActive: true,
      lastLoginAt: daysAgoIso(2, 12),
      createdAt: daysAgoIso(120),
      passwordHash: defaultPwdHash,
    },
    {
      id: 'usr-fin-01',
      roleId: 4,
      roleCode: 'finance',
      roleName: 'Accounts & Finance',
      fullName: 'Siddharth Joshi',
      email: 'finance@avasarealty.in',
      phone: '+91 98200 99310',
      city: 'Mumbai',
      monthlyTargetInr: 0,
      commissionRatePct: 0,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 10),
      createdAt: daysAgoIso(160),
      passwordHash: defaultPwdHash,
    },
  ];

  const projects: ProjectRecord[] = [
    {
      id: 'prj-01',
      code: 'PRJ-BLR-01',
      name: 'Avasa Skyline Residences',
      developerName: 'Avasa Urban Developers Pvt Ltd',
      reraId: 'PRM/KA/RERA/1251/446/PR/240215/006612',
      projectType: 'residential',
      city: 'Bengaluru',
      microMarket: 'Whitefield',
      address: 'ITPL Main Road, Whitefield, Bengaluru 560066',
      totalUnits: 240,
      availableUnits: 48,
      basePriceMinInr: 12500000,
      basePriceMaxInr: 26500000,
      possessionDate: '2027-06-30',
      status: 'under_construction',
      imageUrl: '/src/assets/images/project_skyline_residences_1794906610259.jpg',
      createdAt: daysAgoIso(200),
    },
    {
      id: 'prj-02',
      code: 'PRJ-HYD-02',
      name: 'Emerald Courtyard Villas',
      developerName: 'Avasa Luxury Estates LLP',
      reraId: 'P02400007821',
      projectType: 'residential',
      city: 'Hyderabad',
      microMarket: 'Mokila',
      address: 'Mokila Villa Corridor, Shankarpally Road, Hyderabad 501203',
      totalUnits: 64,
      availableUnits: 14,
      basePriceMinInr: 34000000,
      basePriceMaxInr: 52000000,
      possessionDate: '2026-12-31',
      status: 'ready_to_move',
      imageUrl: '/src/assets/images/project_emerald_villas_1794906611136.jpg',
      createdAt: daysAgoIso(190),
    },
    {
      id: 'prj-03',
      code: 'PRJ-GGN-03',
      name: 'Avasa One Tech Plaza',
      developerName: 'Avasa Commercial Realty',
      reraId: 'RC/REP/HARERA/GGM/712/444/2025/19',
      projectType: 'commercial',
      city: 'Gurugram',
      microMarket: 'Golf Course Ext Rd',
      address: 'Sector 62, Golf Course Extension Road, Gurugram 122102',
      totalUnits: 110,
      availableUnits: 29,
      basePriceMinInr: 18500000,
      basePriceMaxInr: 74000000,
      possessionDate: '2027-03-31',
      status: 'under_construction',
      imageUrl: '/src/assets/images/project_tech_park_commercial_1794906610846.jpg',
      createdAt: daysAgoIso(175),
    },
    {
      id: 'prj-04',
      code: 'PRJ-PUN-04',
      name: 'Sahyadri Meadow Plots',
      developerName: 'Avasa Landmarks Pvt Ltd',
      reraId: 'P52100054329',
      projectType: 'plotted_development',
      city: 'Pune',
      microMarket: 'Hinjewadi Phase 3',
      address: 'Marunji-Kasarsai Link Road, Hinjewadi Phase 3, Pune 411057',
      totalUnits: 180,
      availableUnits: 52,
      basePriceMinInr: 6200000,
      basePriceMaxInr: 14800000,
      possessionDate: '2026-09-30',
      status: 'ready_to_move',
      imageUrl: '/src/assets/images/project_meadow_plots_1794906611396.jpg',
      createdAt: daysAgoIso(160),
    },
  ];

  const properties: PropertyRecord[] = [
    {
      id: 'prop-01',
      projectId: 'prj-01',
      unitCode: 'BLR-A-1402',
      title: 'Skyline Tower A — 3 BHK Corner Skyhome',
      category: 'apartment',
      transactionType: 'primary_sale',
      city: 'Bengaluru',
      locality: 'Whitefield',
      configuration: '3 BHK + Study',
      carpetAreaSqft: 1480,
      superBuiltupSqft: 2050,
      facing: 'East',
      floorNumber: 14,
      priceInr: 18500000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'unfurnished',
      status: 'booked',
      createdAt: daysAgoIso(90),
    },
    {
      id: 'prop-02',
      projectId: 'prj-01',
      unitCode: 'BLR-B-1904',
      title: 'Skyline Tower B — 3 BHK Garden View',
      category: 'apartment',
      transactionType: 'primary_sale',
      city: 'Bengaluru',
      locality: 'Whitefield',
      configuration: '3 BHK',
      carpetAreaSqft: 1320,
      superBuiltupSqft: 1810,
      facing: 'North-East',
      floorNumber: 19,
      priceInr: 16200000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'unfurnished',
      status: 'available',
      createdAt: daysAgoIso(85),
    },
    {
      id: 'prop-03',
      projectId: 'prj-02',
      unitCode: 'HYD-V-09',
      title: 'Emerald Courtyard — 4 BHK Private Pool Villa',
      category: 'villa',
      transactionType: 'primary_sale',
      city: 'Hyderabad',
      locality: 'Mokila',
      configuration: '4 BHK Triplex Villa',
      carpetAreaSqft: 3200,
      superBuiltupSqft: 4150,
      facing: 'North',
      floorNumber: 0,
      priceInr: 42500000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'semi_furnished',
      status: 'booked',
      createdAt: daysAgoIso(80),
    },
    {
      id: 'prop-04',
      projectId: 'prj-02',
      unitCode: 'HYD-V-14',
      title: 'Emerald Courtyard — 4 BHK Corner Lawn Villa',
      category: 'villa',
      transactionType: 'primary_sale',
      city: 'Hyderabad',
      locality: 'Mokila',
      configuration: '4 BHK Villa',
      carpetAreaSqft: 2950,
      superBuiltupSqft: 3800,
      facing: 'East',
      floorNumber: 0,
      priceInr: 37800000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'semi_furnished',
      status: 'available',
      createdAt: daysAgoIso(75),
    },
    {
      id: 'prop-05',
      projectId: 'prj-03',
      unitCode: 'GGN-C-704',
      title: 'Avasa One Tech Plaza — Grade-A Corner Office',
      category: 'commercial',
      transactionType: 'primary_sale',
      city: 'Gurugram',
      locality: 'Sector 62',
      configuration: '3,100 sq.ft Office Suite',
      carpetAreaSqft: 2350,
      superBuiltupSqft: 3100,
      facing: 'North-East',
      floorNumber: 7,
      priceInr: 37200000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'semi_furnished',
      status: 'booked',
      createdAt: daysAgoIso(70),
    },
    {
      id: 'prop-06',
      projectId: 'prj-03',
      unitCode: 'GGN-R-003',
      title: 'Avasa One Plaza — High-Street Retail Flagship',
      category: 'commercial',
      transactionType: 'primary_sale',
      city: 'Gurugram',
      locality: 'Sector 62',
      configuration: '1,850 sq.ft Ground Retail',
      carpetAreaSqft: 1480,
      superBuiltupSqft: 1850,
      facing: 'North',
      floorNumber: 0,
      priceInr: 44500000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'unfurnished',
      status: 'available',
      createdAt: daysAgoIso(65),
    },
    {
      id: 'prop-07',
      projectId: 'prj-04',
      unitCode: 'PUN-P-118',
      title: 'Sahyadri Meadows — Corner NA Residential Plot',
      category: 'plot_land',
      transactionType: 'primary_sale',
      city: 'Pune',
      locality: 'Hinjewadi Phase 3',
      configuration: '2,400 sq.ft NA Plot',
      carpetAreaSqft: 2400,
      superBuiltupSqft: 2400,
      facing: 'East',
      floorNumber: 0,
      priceInr: 9600000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'unfurnished',
      status: 'booked',
      createdAt: daysAgoIso(60),
    },
    {
      id: 'prop-08',
      projectId: 'prj-04',
      unitCode: 'PUN-P-142',
      title: 'Sahyadri Meadows — Park-Facing Villa Plot',
      category: 'plot_land',
      transactionType: 'primary_sale',
      city: 'Pune',
      locality: 'Hinjewadi Phase 3',
      configuration: '3,000 sq.ft Plot',
      carpetAreaSqft: 3000,
      superBuiltupSqft: 3000,
      facing: 'North',
      floorNumber: 0,
      priceInr: 12400000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'unfurnished',
      status: 'available',
      createdAt: daysAgoIso(55),
    },
    {
      id: 'prop-09',
      projectId: null,
      unitCode: 'MUM-RNT-22',
      title: 'Worli Sea-View Furnished 3 BHK Corporate Lease',
      category: 'residential',
      transactionType: 'rental',
      city: 'Mumbai',
      locality: 'Worli',
      configuration: '3 BHK Luxury Rental',
      carpetAreaSqft: 1520,
      superBuiltupSqft: 1980,
      facing: 'West',
      floorNumber: 22,
      priceInr: 95000000,
      monthlyRentInr: 185000,
      securityDepositInr: 925000,
      furnishing: 'fully_furnished',
      status: 'available',
      createdAt: daysAgoIso(45),
    },
    {
      id: 'prop-10',
      projectId: null,
      unitCode: 'BLR-RSL-08',
      title: 'Indiranagar 100ft Rd Boutique Resale Residence',
      category: 'residential',
      transactionType: 'resale',
      city: 'Bengaluru',
      locality: 'Indiranagar',
      configuration: '4 BHK Resale Independent',
      carpetAreaSqft: 2900,
      superBuiltupSqft: 3400,
      facing: 'North',
      floorNumber: 0,
      priceInr: 56000000,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: 'fully_furnished',
      status: 'available',
      createdAt: daysAgoIso(40),
    },
  ];

  const leads: LeadRecord[] = [
    {
      id: 'lead-01',
      leadCode: 'AVS-2026-101',
      fullName: 'Karthik Subramanian',
      phone: '+91 98452 33190',
      email: 'karthik.s@techmail.in',
      preferredLanguage: 'en',
      source: 'whatsapp',
      temperature: 'hot',
      stage: 'booked',
      interestedCategory: 'apartment',
      transactionIntent: 'primary_sale',
      preferredCity: 'Bengaluru',
      preferredLocality: 'Whitefield',
      budgetMinInr: 15000000,
      budgetMaxInr: 20000000,
      projectId: 'prj-01',
      assignedTo: 'usr-exec-01',
      aiSummary: 'VP Engineering looking for East-facing 3 BHK near ITPL. Booked Tower A 1402.',
      lastContactedAt: daysAgoIso(1, 16),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(42),
      updatedAt: daysAgoIso(1),
    },
    {
      id: 'lead-02',
      leadCode: 'AVS-2026-102',
      fullName: 'Ananya Reddy',
      phone: '+91 99890 12045',
      email: 'ananya.reddy@hydventure.in',
      preferredLanguage: 'en',
      source: '99acres',
      temperature: 'hot',
      stage: 'booked',
      interestedCategory: 'villa',
      transactionIntent: 'primary_sale',
      preferredCity: 'Hyderabad',
      preferredLocality: 'Mokila',
      budgetMinInr: 35000000,
      budgetMaxInr: 45000000,
      projectId: 'prj-02',
      assignedTo: 'usr-exec-02',
      aiSummary: 'NRI family relocating to Hyderabad; confirmed Villa HYD-V-09.',
      lastContactedAt: daysAgoIso(2, 15),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(38),
      updatedAt: daysAgoIso(2),
    },
    {
      id: 'lead-03',
      leadCode: 'AVS-2026-103',
      fullName: 'Rajeshwari Kapoor',
      phone: '+91 98104 88721',
      email: 'r.kapoor@delhicorp.in',
      preferredLanguage: 'hi',
      source: 'google_ads',
      temperature: 'hot',
      stage: 'booked',
      interestedCategory: 'commercial',
      transactionIntent: 'primary_sale',
      preferredCity: 'Gurugram',
      preferredLocality: 'Sector 62',
      budgetMinInr: 30000000,
      budgetMaxInr: 42000000,
      projectId: 'prj-03',
      assignedTo: 'usr-exec-03',
      aiSummary: 'CA firm acquiring 3,100 sq.ft Grade-A corporate office on Golf Course Ext Rd.',
      lastContactedAt: daysAgoIso(3, 14),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(31),
      updatedAt: daysAgoIso(3),
    },
    {
      id: 'lead-04',
      leadCode: 'AVS-2026-104',
      fullName: 'Prashant Bhosale',
      phone: '+91 97654 22109',
      email: 'prashant.b@puneforge.in',
      preferredLanguage: 'mr',
      source: 'magicbricks',
      temperature: 'hot',
      stage: 'booked',
      interestedCategory: 'plot_land',
      transactionIntent: 'primary_sale',
      preferredCity: 'Pune',
      preferredLocality: 'Hinjewadi Phase 3',
      budgetMinInr: 8000000,
      budgetMaxInr: 12000000,
      projectId: 'prj-04',
      assignedTo: 'usr-exec-04',
      aiSummary: 'Bought corner NA plot PUN-P-118; loan pre-approved with SBI.',
      lastContactedAt: daysAgoIso(4, 12),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(25),
      updatedAt: daysAgoIso(4),
    },
    {
      id: 'lead-05',
      leadCode: 'AVS-2026-105',
      fullName: 'Nikhil Sharma',
      phone: '+91 98801 66742',
      email: 'nikhil.sharma@fintech.co.in',
      preferredLanguage: 'hi-Latn',
      source: 'whatsapp',
      temperature: 'hot',
      stage: 'negotiation',
      interestedCategory: 'apartment',
      transactionIntent: 'primary_sale',
      preferredCity: 'Bengaluru',
      preferredLocality: 'Whitefield',
      budgetMinInr: 14000000,
      budgetMaxInr: 17500000,
      projectId: 'prj-01',
      assignedTo: 'usr-exec-01',
      aiSummary: 'Visited Skyline Residences twice; negotiating floor-rise waiver on BLR-B-1904.',
      lastContactedAt: daysAgoIso(0, 12),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(12),
      updatedAt: daysAgoIso(0),
    },
    {
      id: 'lead-06',
      leadCode: 'AVS-2026-106',
      fullName: 'Deepika Venkatesh',
      phone: '+91 98401 44512',
      email: 'deepika.v@chennaiholdings.in',
      preferredLanguage: 'ta',
      source: 'meta_ads',
      temperature: 'hot',
      stage: 'site_visit_scheduled',
      interestedCategory: 'villa',
      transactionIntent: 'primary_sale',
      preferredCity: 'Hyderabad',
      preferredLocality: 'Mokila',
      budgetMinInr: 32000000,
      budgetMaxInr: 40000000,
      projectId: 'prj-02',
      assignedTo: 'usr-exec-02',
      aiSummary: 'Tamil-speaking buyer exploring Emerald Courtyard 4 BHK corner villa; weekend visit booked.',
      lastContactedAt: daysAgoIso(0, 10),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(4),
      updatedAt: daysAgoIso(0),
    },
    {
      id: 'lead-07',
      leadCode: 'AVS-2026-107',
      fullName: 'Harshvardhan Mehta',
      phone: '+91 98204 71200',
      email: 'h.mehta@mumbaiassets.in',
      preferredLanguage: 'gu',
      source: 'referral',
      temperature: 'warm',
      stage: 'site_visit_done',
      interestedCategory: 'residential',
      transactionIntent: 'rental',
      preferredCity: 'Mumbai',
      preferredLocality: 'Worli',
      budgetMinInr: 160000,
      budgetMaxInr: 200000,
      projectId: null,
      assignedTo: 'usr-exec-01',
      aiSummary: 'Corporate MD looking for Worli sea-facing 3 BHK lease at ₹1.85L/month.',
      lastContactedAt: daysAgoIso(1, 17),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(9),
      updatedAt: daysAgoIso(1),
    },
    {
      id: 'lead-08',
      leadCode: 'AVS-2026-108',
      fullName: 'Gaurav Taneja',
      phone: '+91 99100 55432',
      email: 'gaurav.t@ncrretail.in',
      preferredLanguage: 'hi',
      source: 'housing_com',
      temperature: 'warm',
      stage: 'qualified',
      interestedCategory: 'commercial',
      transactionIntent: 'primary_sale',
      preferredCity: 'Gurugram',
      preferredLocality: 'Sector 62',
      budgetMinInr: 35000000,
      budgetMaxInr: 48000000,
      projectId: 'prj-03',
      assignedTo: 'usr-exec-03',
      aiSummary: 'Interested in high-street ground retail unit GGN-R-003 for flagship café.',
      lastContactedAt: daysAgoIso(2, 11),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(7),
      updatedAt: daysAgoIso(2),
    },
    {
      id: 'lead-09',
      leadCode: 'AVS-2026-109',
      fullName: 'Kavita Deshpande',
      phone: '+91 98230 90122',
      email: 'kavita.d@puneit.in',
      preferredLanguage: 'mr',
      source: 'website',
      temperature: 'warm',
      stage: 'contacted',
      interestedCategory: 'plot_land',
      transactionIntent: 'primary_sale',
      preferredCity: 'Pune',
      preferredLocality: 'Hinjewadi Phase 3',
      budgetMinInr: 9000000,
      budgetMaxInr: 13500000,
      projectId: 'prj-04',
      assignedTo: 'usr-exec-04',
      aiSummary: 'Requested RERA layout plan & 3,000 sq.ft park-facing plot pricing.',
      lastContactedAt: daysAgoIso(3, 15),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(6),
      updatedAt: daysAgoIso(3),
    },
    {
      id: 'lead-10',
      leadCode: 'AVS-2026-110',
      fullName: 'Aarav Singhal',
      phone: '+91 96111 88201',
      email: 'aarav.singhal@startup.in',
      preferredLanguage: 'en',
      source: 'whatsapp',
      temperature: 'hot',
      stage: 'new',
      interestedCategory: 'residential',
      transactionIntent: 'resale',
      preferredCity: 'Bengaluru',
      preferredLocality: 'Indiranagar',
      budgetMinInr: 50000000,
      budgetMaxInr: 60000000,
      projectId: null,
      assignedTo: 'usr-exec-01',
      aiSummary: 'Inbound today via WhatsApp asking for Indiranagar resale independent home.',
      lastContactedAt: daysAgoIso(0, 9),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(0, 9),
      updatedAt: daysAgoIso(0, 9),
    },
    {
      id: 'lead-11',
      leadCode: 'AVS-2026-111',
      fullName: 'Srinivas Rao',
      phone: '+91 98480 61234',
      email: 'srinivas.rao@hydcloud.in',
      preferredLanguage: 'te',
      source: 'meta_ads',
      temperature: 'warm',
      stage: 'new',
      interestedCategory: 'villa',
      transactionIntent: 'primary_sale',
      preferredCity: 'Hyderabad',
      preferredLocality: 'Mokila',
      budgetMinInr: 32000000,
      budgetMaxInr: 42000000,
      projectId: 'prj-02',
      assignedTo: 'usr-exec-02',
      aiSummary: 'Today enquiry from Meta Ads; requested Telugu brochure for Emerald Courtyard.',
      lastContactedAt: null,
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(0, 10),
      updatedAt: daysAgoIso(0, 10),
    },
    {
      id: 'lead-12',
      leadCode: 'AVS-2026-112',
      fullName: 'Manoj Tiwari',
      phone: '+91 98991 34120',
      email: 'manoj.tiwari@mail.in',
      preferredLanguage: 'hi',
      source: '99acres',
      temperature: 'cold',
      stage: 'contacted',
      interestedCategory: 'commercial',
      transactionIntent: 'primary_sale',
      preferredCity: 'Gurugram',
      preferredLocality: 'Sector 62',
      budgetMinInr: 18000000,
      budgetMaxInr: 22000000,
      projectId: 'prj-03',
      assignedTo: 'usr-exec-03',
      aiSummary: 'Exploring Q1 2027 commercial investment; requested follow-up next quarter.',
      lastContactedAt: daysAgoIso(14),
      retentionExpiresAt: daysAheadIso(330),
      createdAt: daysAgoIso(21),
      updatedAt: daysAgoIso(14),
    },
    {
      id: 'lead-13',
      leadCode: 'AVS-2026-113',
      fullName: 'Shruti Hegde',
      phone: '+91 97400 19823',
      email: 'shruti.hegde@bengaluru.in',
      preferredLanguage: 'kn',
      source: 'walk_in',
      temperature: 'cold',
      stage: 'lost',
      interestedCategory: 'apartment',
      transactionIntent: 'primary_sale',
      preferredCity: 'Bengaluru',
      preferredLocality: 'Whitefield',
      budgetMinInr: 11000000,
      budgetMaxInr: 13000000,
      projectId: 'prj-01',
      assignedTo: 'usr-exec-01',
      aiSummary: 'Postponed purchase decision; opted out of promotional messages.',
      lastContactedAt: daysAgoIso(18),
      retentionExpiresAt: daysAheadIso(300),
      createdAt: daysAgoIso(35),
      updatedAt: daysAgoIso(18),
    },
  ];

  const customers: CustomerRecord[] = [
    {
      id: 'cust-01',
      leadId: 'lead-01',
      assignedTo: 'usr-exec-01',
      fullName: 'Karthik Subramanian',
      phone: '+91 98452 33190',
      email: 'karthik.s@techmail.in',
      panMasked: 'ABCPK****7M',
      city: 'Bengaluru',
      correspondenceAddress: '42, HAL 2nd Stage, Indiranagar, Bengaluru 560038',
      kycVerified: true,
      createdAt: daysAgoIso(15),
    },
    {
      id: 'cust-02',
      leadId: 'lead-02',
      assignedTo: 'usr-exec-02',
      fullName: 'Ananya Reddy',
      phone: '+91 99890 12045',
      email: 'ananya.reddy@hydventure.in',
      panMasked: 'BGHPR****2Q',
      city: 'Hyderabad',
      correspondenceAddress: 'Plot 18, Jubilee Hills Road No. 45, Hyderabad 500033',
      kycVerified: true,
      createdAt: daysAgoIso(12),
    },
    {
      id: 'cust-03',
      leadId: 'lead-03',
      assignedTo: 'usr-exec-03',
      fullName: 'Rajeshwari Kapoor',
      phone: '+91 98104 88721',
      email: 'r.kapoor@delhicorp.in',
      panMasked: 'AAACK****9L',
      city: 'Gurugram',
      correspondenceAddress: 'DLF Phase 2, Tower M-4, Gurugram 122002',
      kycVerified: true,
      createdAt: daysAgoIso(9),
    },
    {
      id: 'cust-04',
      leadId: 'lead-04',
      assignedTo: 'usr-exec-04',
      fullName: 'Prashant Bhosale',
      phone: '+91 97654 22109',
      email: 'prashant.b@puneforge.in',
      panMasked: 'ADGPB****4D',
      city: 'Pune',
      correspondenceAddress: 'Baner Balewadi High Street, Pune 411045',
      kycVerified: true,
      createdAt: daysAgoIso(7),
    },
  ];

  const consent: ConsentRecord[] = [
    {
      id: 'con-01',
      leadId: 'lead-05',
      customerId: null,
      contactName: 'Nikhil Sharma',
      phone: '+91 98801 66742',
      channel: 'whatsapp',
      purpose: 'sales_followup',
      status: 'granted',
      sourceProof: 'WhatsApp Opt-In Keyword & Website Form #W-882',
      grantedAt: daysAgoIso(12),
      withdrawnAt: null,
      updatedAt: daysAgoIso(12),
    },
    {
      id: 'con-02',
      leadId: 'lead-06',
      customerId: null,
      contactName: 'Deepika Venkatesh',
      phone: '+91 98401 44512',
      channel: 'whatsapp',
      purpose: 'ai_chatbot',
      status: 'granted',
      sourceProof: 'Meta Lead Ad Consent Checkbox #MA-410',
      grantedAt: daysAgoIso(4),
      withdrawnAt: null,
      updatedAt: daysAgoIso(4),
    },
    {
      id: 'con-03',
      leadId: 'lead-10',
      customerId: null,
      contactName: 'Aarav Singhal',
      phone: '+91 96111 88201',
      channel: 'whatsapp',
      purpose: 'sales_followup',
      status: 'granted',
      sourceProof: 'Inbound WhatsApp Initiation',
      grantedAt: daysAgoIso(0, 9),
      withdrawnAt: null,
      updatedAt: daysAgoIso(0, 9),
    },
    {
      id: 'con-04',
      leadId: 'lead-13',
      customerId: null,
      contactName: 'Shruti Hegde',
      phone: '+91 97400 19823',
      channel: 'whatsapp',
      purpose: 'marketing_campaigns',
      status: 'opted_out',
      sourceProof: 'Customer replied STOP on WhatsApp',
      grantedAt: daysAgoIso(35),
      withdrawnAt: daysAgoIso(18),
      updatedAt: daysAgoIso(18),
    },
    {
      id: 'con-05',
      leadId: 'lead-01',
      customerId: 'cust-01',
      contactName: 'Karthik Subramanian',
      phone: '+91 98452 33190',
      channel: 'whatsapp',
      purpose: 'kyc_processing',
      status: 'granted',
      sourceProof: 'Signed Booking Form DPDP Clause #BK-101',
      grantedAt: daysAgoIso(15),
      withdrawnAt: null,
      updatedAt: daysAgoIso(15),
    },
  ];

  const conversations: ConversationRecord[] = [
    {
      id: 'conv-01',
      leadId: 'lead-05',
      assignedTo: 'usr-exec-01',
      channel: 'whatsapp',
      waPhone: '+91 98801 66742',
      detectedLanguage: 'hi-Latn',
      aiEnabled: true,
      status: 'open',
      lastMessageAt: daysAgoIso(0, 12),
      createdAt: daysAgoIso(12),
    },
    {
      id: 'conv-02',
      leadId: 'lead-06',
      assignedTo: 'usr-exec-02',
      channel: 'whatsapp',
      waPhone: '+91 98401 44512',
      detectedLanguage: 'ta',
      aiEnabled: true,
      status: 'open',
      lastMessageAt: daysAgoIso(0, 10),
      createdAt: daysAgoIso(4),
    },
    {
      id: 'conv-03',
      leadId: 'lead-10',
      assignedTo: 'usr-exec-01',
      channel: 'whatsapp',
      waPhone: '+91 96111 88201',
      detectedLanguage: 'en',
      aiEnabled: true,
      status: 'open',
      lastMessageAt: daysAgoIso(0, 9),
      createdAt: daysAgoIso(0, 9),
    },
    {
      id: 'conv-04',
      leadId: 'lead-13',
      assignedTo: 'usr-exec-01',
      channel: 'whatsapp',
      waPhone: '+91 97400 19823',
      detectedLanguage: 'en',
      aiEnabled: false,
      status: 'opted_out',
      lastMessageAt: daysAgoIso(18),
      createdAt: daysAgoIso(35),
    },
  ];

  const messages: MessageRecord[] = [
    {
      id: 'msg-01',
      conversationId: 'conv-01',
      direction: 'inbound',
      senderType: 'customer',
      senderUserId: null,
      body: 'Hi, Whitefield mein 3 BHK flat chahiye around 1.6 Cr budget. Tower B ka floor rise discount milega kya?',
      languageCode: 'hi-Latn',
      waMessageId: 'wamid.HBgMOTE5ODgwMTY2NzQy',
      deliveryStatus: 'read',
      createdAt: daysAgoIso(0, 11),
    },
    {
      id: 'msg-02',
      conversationId: 'conv-01',
      direction: 'outbound',
      senderType: 'ai_bot',
      senderUserId: null,
      body: 'Namaste Nikhil ji! Avasa Skyline Residences (Whitefield, RERA: PRM/KA/RERA/1251/446/PR/240215/006612) mein hamare paas Unit BLR-B-1904 (3 BHK, 1,810 sq.ft, North-East facing) ₹1.62 Cr mein available hai. Floor-rise waiver ke liye Arjun Deshmukh aaj 4 PM IST call par final offer share karenge.',
      languageCode: 'hi-Latn',
      waMessageId: 'wamid.AI0012',
      deliveryStatus: 'delivered',
      createdAt: daysAgoIso(0, 12),
    },
    {
      id: 'msg-03',
      conversationId: 'conv-02',
      direction: 'inbound',
      senderType: 'customer',
      senderUserId: null,
      body: 'வணக்கம், ஹைதராபாத் Mokila-வில் 4 BHK வில்லா விலை என்ன? இந்த வார இறுதியில் பார்க்க முடியுமா?',
      languageCode: 'ta',
      waMessageId: 'wamid.TA0091',
      deliveryStatus: 'read',
      createdAt: daysAgoIso(0, 10),
    },
    {
      id: 'msg-04',
      conversationId: 'conv-02',
      direction: 'outbound',
      senderType: 'ai_bot',
      senderUserId: null,
      body: 'வணக்கம் தீபிகா! Emerald Courtyard Villas (Mokila, RERA: P02400007821) திட்டத்தில் 4 BHK Corner Lawn Villa (3,800 sq.ft, கிழக்கு திசை) ₹3.78 Cr விலையில் தயாராக உள்ளது. சனிக்கிழமை காலை 11:00 மணிக்கு நேரில் பார்க்க ஏற்பாடு செய்துள்ளோம்.',
      languageCode: 'ta',
      waMessageId: 'wamid.AI0013',
      deliveryStatus: 'delivered',
      createdAt: daysAgoIso(0, 10),
    },
    {
      id: 'msg-05',
      conversationId: 'conv-03',
      direction: 'inbound',
      senderType: 'customer',
      senderUserId: null,
      body: 'Looking for an independent resale house in Indiranagar 100ft road around 5.5 Cr. Any verified options?',
      languageCode: 'en',
      waMessageId: 'wamid.EN1102',
      deliveryStatus: 'read',
      createdAt: daysAgoIso(0, 9),
    },
    {
      id: 'msg-06',
      conversationId: 'conv-04',
      direction: 'inbound',
      senderType: 'customer',
      senderUserId: null,
      body: 'STOP',
      languageCode: 'en',
      waMessageId: 'wamid.OPT991',
      deliveryStatus: 'read',
      createdAt: daysAgoIso(18),
    },
  ];

  const siteVisits: SiteVisitRecord[] = [
    {
      id: 'sv-01',
      leadId: 'lead-01',
      projectId: 'prj-01',
      propertyId: 'prop-01',
      assignedTo: 'usr-exec-01',
      scheduledAt: daysAgoIso(20, 11),
      completedAt: daysAgoIso(20, 12),
      status: 'completed',
      pickupRequired: false,
      feedback: 'Loved the podium garden & corner ventilation in Tower A.',
      rating: 5,
      createdAt: daysAgoIso(24),
    },
    {
      id: 'sv-02',
      leadId: 'lead-02',
      projectId: 'prj-02',
      propertyId: 'prop-03',
      assignedTo: 'usr-exec-02',
      scheduledAt: daysAgoIso(16, 10),
      completedAt: daysAgoIso(16, 11),
      status: 'completed',
      pickupRequired: true,
      feedback: 'Approved courtyard layout & ready-to-move finishing quality.',
      rating: 5,
      createdAt: daysAgoIso(19),
    },
    {
      id: 'sv-03',
      leadId: 'lead-05',
      projectId: 'prj-01',
      propertyId: 'prop-02',
      assignedTo: 'usr-exec-01',
      scheduledAt: daysAgoIso(3, 16),
      completedAt: daysAgoIso(3, 17),
      status: 'completed',
      pickupRequired: false,
      feedback: 'Shortlisted 19th floor unit; awaiting final pricing approval.',
      rating: 4,
      createdAt: daysAgoIso(6),
    },
    {
      id: 'sv-04',
      leadId: 'lead-06',
      projectId: 'prj-02',
      propertyId: 'prop-04',
      assignedTo: 'usr-exec-02',
      scheduledAt: daysAheadIso(2, 11),
      completedAt: null,
      status: 'scheduled',
      pickupRequired: true,
      feedback: null,
      rating: null,
      createdAt: daysAgoIso(1),
    },
    {
      id: 'sv-05',
      leadId: 'lead-08',
      projectId: 'prj-03',
      propertyId: 'prop-06',
      assignedTo: 'usr-exec-03',
      scheduledAt: daysAheadIso(1, 15),
      completedAt: null,
      status: 'scheduled',
      pickupRequired: false,
      feedback: null,
      rating: null,
      createdAt: daysAgoIso(2),
    },
  ];

  const bookings: BookingRecord[] = [
    {
      id: 'bk-01',
      bookingCode: 'BK-BLR-2026-01',
      leadId: 'lead-01',
      customerId: 'cust-01',
      projectId: 'prj-01',
      propertyId: 'prop-01',
      closedBy: 'usr-exec-01',
      agreementValueInr: 18500000,
      gstAmountInr: 925000,
      totalPayableInr: 19425000,
      bookingDate: formatIstDate(new Date(Date.now() - 15 * 86400000)),
      status: 'confirmed',
      retentionUntil: '2034-11-17',
      createdAt: daysAgoIso(15),
    },
    {
      id: 'bk-02',
      bookingCode: 'BK-HYD-2026-02',
      leadId: 'lead-02',
      customerId: 'cust-02',
      projectId: 'prj-02',
      propertyId: 'prop-03',
      closedBy: 'usr-exec-02',
      agreementValueInr: 42500000,
      gstAmountInr: 0, // OC received ready-to-move exempt from GST
      totalPayableInr: 42500000,
      bookingDate: formatIstDate(new Date(Date.now() - 12 * 86400000)),
      status: 'registered',
      retentionUntil: '2034-11-17',
      createdAt: daysAgoIso(12),
    },
    {
      id: 'bk-03',
      bookingCode: 'BK-GGN-2026-03',
      leadId: 'lead-03',
      customerId: 'cust-03',
      projectId: 'prj-03',
      propertyId: 'prop-05',
      closedBy: 'usr-exec-03',
      agreementValueInr: 37200000,
      gstAmountInr: 4464000, // 12% Commercial GST
      totalPayableInr: 41664000,
      bookingDate: formatIstDate(new Date(Date.now() - 9 * 86400000)),
      status: 'confirmed',
      retentionUntil: '2034-11-17',
      createdAt: daysAgoIso(9),
    },
    {
      id: 'bk-04',
      bookingCode: 'BK-PUN-2026-04',
      leadId: 'lead-04',
      customerId: 'cust-04',
      projectId: 'prj-04',
      propertyId: 'prop-07',
      closedBy: 'usr-exec-04',
      agreementValueInr: 9600000,
      gstAmountInr: 0, // Land / plot exempt from GST
      totalPayableInr: 9600000,
      bookingDate: formatIstDate(new Date(Date.now() - 7 * 86400000)),
      status: 'confirmed',
      retentionUntil: '2034-11-17',
      createdAt: daysAgoIso(7),
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: 'pay-01',
      bookingId: 'bk-01',
      milestoneName: 'Booking Token (10%)',
      amountInr: 1942500,
      dueDate: formatIstDate(new Date(Date.now() - 14 * 86400000)),
      paidDate: formatIstDate(new Date(Date.now() - 14 * 86400000)),
      paymentMode: 'neft_rtgs',
      utrReference: 'HDFCR5202611039812',
      status: 'paid',
      createdAt: daysAgoIso(14),
    },
    {
      id: 'pay-02',
      bookingId: 'bk-01',
      milestoneName: 'Agreement Execution (20%)',
      amountInr: 3885000,
      dueDate: formatIstDate(new Date(Date.now() + 7 * 86400000)),
      paidDate: null,
      paymentMode: null,
      utrReference: null,
      status: 'pending',
      createdAt: daysAgoIso(14),
    },
    {
      id: 'pay-03',
      bookingId: 'bk-02',
      milestoneName: 'Initial Down Payment (50%)',
      amountInr: 21250000,
      dueDate: formatIstDate(new Date(Date.now() - 10 * 86400000)),
      paidDate: formatIstDate(new Date(Date.now() - 10 * 86400000)),
      paymentMode: 'home_loan_disbursement',
      utrReference: 'ICICHL202611070019',
      status: 'paid',
      createdAt: daysAgoIso(10),
    },
    {
      id: 'pay-04',
      bookingId: 'bk-02',
      milestoneName: 'Registration & Handover (50%)',
      amountInr: 21250000,
      dueDate: formatIstDate(new Date(Date.now() - 3 * 86400000)),
      paidDate: formatIstDate(new Date(Date.now() - 3 * 86400000)),
      paymentMode: 'neft_rtgs',
      utrReference: 'SBINR1202611145520',
      status: 'paid',
      createdAt: daysAgoIso(3),
    },
    {
      id: 'pay-05',
      bookingId: 'bk-03',
      milestoneName: 'Corporate Booking Advance (25%)',
      amountInr: 10416000,
      dueDate: formatIstDate(new Date(Date.now() - 7 * 86400000)),
      paidDate: formatIstDate(new Date(Date.now() - 7 * 86400000)),
      paymentMode: 'neft_rtgs',
      utrReference: 'AXISR4202611108841',
      status: 'paid',
      createdAt: daysAgoIso(7),
    },
    {
      id: 'pay-06',
      bookingId: 'bk-03',
      milestoneName: 'Fit-out & Slab Milestone (25%)',
      amountInr: 10416000,
      dueDate: formatIstDate(new Date(Date.now() - 1 * 86400000)),
      paidDate: null,
      paymentMode: null,
      utrReference: null,
      status: 'overdue',
      createdAt: daysAgoIso(7),
    },
    {
      id: 'pay-07',
      bookingId: 'bk-04',
      milestoneName: 'Plot Allotment & 40% Payment',
      amountInr: 3840000,
      dueDate: formatIstDate(new Date(Date.now() - 5 * 86400000)),
      paidDate: formatIstDate(new Date(Date.now() - 5 * 86400000)),
      paymentMode: 'upi',
      utrReference: 'UPI632189440128',
      status: 'paid',
      createdAt: daysAgoIso(5),
    },
    {
      id: 'pay-08',
      bookingId: 'bk-04',
      milestoneName: 'Sale Deed Balance (60%)',
      amountInr: 5760000,
      dueDate: formatIstDate(new Date(Date.now() + 14 * 86400000)),
      paidDate: null,
      paymentMode: null,
      utrReference: null,
      status: 'pending',
      createdAt: daysAgoIso(5),
    },
  ];

  const commissions: CommissionRecord[] = [
    {
      id: 'com-01',
      bookingId: 'bk-01',
      employeeId: 'usr-exec-01',
      commissionRatePct: 1.5,
      grossAmountInr: 277500,
      tdsDeductedInr: 13875,
      netPayableInr: 263625,
      status: 'approved',
      approvedBy: 'usr-fin-01',
      paidAt: null,
      createdAt: daysAgoIso(14),
    },
    {
      id: 'com-02',
      bookingId: 'bk-02',
      employeeId: 'usr-exec-02',
      commissionRatePct: 1.5,
      grossAmountInr: 637500,
      tdsDeductedInr: 31875,
      netPayableInr: 605625,
      status: 'paid',
      approvedBy: 'usr-fin-01',
      paidAt: daysAgoIso(2),
      createdAt: daysAgoIso(11),
    },
    {
      id: 'com-03',
      bookingId: 'bk-03',
      employeeId: 'usr-exec-03',
      commissionRatePct: 1.75,
      grossAmountInr: 651000,
      tdsDeductedInr: 32550,
      netPayableInr: 618450,
      status: 'pending',
      approvedBy: null,
      paidAt: null,
      createdAt: daysAgoIso(8),
    },
    {
      id: 'com-04',
      bookingId: 'bk-04',
      employeeId: 'usr-exec-04',
      commissionRatePct: 1.5,
      grossAmountInr: 144000,
      tdsDeductedInr: 7200,
      netPayableInr: 136800,
      status: 'approved',
      approvedBy: 'usr-fin-01',
      paidAt: null,
      createdAt: daysAgoIso(6),
    },
  ];

  const followUps: FollowUpRecord[] = [
    {
      id: 'fu-01',
      leadId: 'lead-05',
      assignedTo: 'usr-exec-01',
      channel: 'call',
      dueAt: daysAheadIso(0, 16),
      notes: 'Confirm floor-rise waiver approval for Tower B 1904 with Nikhil Sharma.',
      isAutomated: false,
      status: 'pending',
      completedAt: null,
      createdAt: daysAgoIso(1),
    },
    {
      id: 'fu-02',
      leadId: 'lead-06',
      assignedTo: 'usr-exec-02',
      channel: 'whatsapp',
      dueAt: daysAheadIso(1, 10),
      notes: 'Send Mokila site location pin & chauffeur details in Tamil.',
      isAutomated: true,
      status: 'pending',
      completedAt: null,
      createdAt: daysAgoIso(1),
    },
    {
      id: 'fu-03',
      leadId: 'lead-08',
      assignedTo: 'usr-exec-03',
      channel: 'in_person',
      dueAt: daysAheadIso(1, 15),
      notes: 'Walkthrough of Ground Retail GGN-R-003 with Gaurav Taneja.',
      isAutomated: false,
      status: 'pending',
      completedAt: null,
      createdAt: daysAgoIso(2),
    },
    {
      id: 'fu-04',
      leadId: 'lead-09',
      assignedTo: 'usr-exec-04',
      channel: 'email',
      dueAt: daysAheadIso(0, 17),
      notes: 'Share PMRDA NA sanction copy and payment schedule for Plot 142.',
      isAutomated: true,
      status: 'pending',
      completedAt: null,
      createdAt: daysAgoIso(2),
    },
  ];

  const campaigns: CampaignRecord[] = [
    {
      id: 'cmp-01',
      name: 'Diwali Festive Zero Floor-Rise — Whitefield',
      channel: 'whatsapp',
      targetTemperature: 'hot',
      targetCity: 'Bengaluru',
      projectId: 'prj-01',
      templateMessage: 'Namaste! Enjoy Zero Floor-Rise on 3 BHK Skyhomes at Avasa Skyline Residences, Whitefield. Reply VISIT to book a chauffeur-driven tour.',
      languageCode: 'en',
      status: 'completed',
      sentCount: 42,
      skippedOptOutCount: 3,
      createdBy: 'usr-mgr-01',
      lastRunAt: daysAgoIso(5),
      createdAt: daysAgoIso(8),
    },
    {
      id: 'cmp-02',
      name: 'Ready-to-Move Villa Open House — Hyderabad',
      channel: 'whatsapp',
      targetTemperature: 'warm',
      targetCity: 'Hyderabad',
      projectId: 'prj-02',
      templateMessage: 'Emerald Courtyard Villas (Mokila) OC received! Tour ready 4 BHK courtyard villas this weekend. Zero GST benefit.',
      languageCode: 'en',
      status: 'scheduled',
      sentCount: 0,
      skippedOptOutCount: 0,
      createdBy: 'usr-mgr-01',
      lastRunAt: null,
      createdAt: daysAgoIso(1),
    },
  ];

  const auditLogs: AuditLogRecord[] = [
    {
      id: 1,
      actorUserId: 'usr-admin-01',
      actorName: 'Vikramaditya Rao',
      actorRole: 'admin',
      action: 'SYSTEM_INITIALIZED',
      entityType: 'system',
      entityId: null,
      details: { timezone: 'Asia/Kolkata', currency: 'INR', dpdpMode: 'strict' },
      ipAddress: '127.0.0.1',
      createdAt: daysAgoIso(15),
    },
    {
      id: 2,
      actorUserId: 'usr-exec-01',
      actorName: 'Arjun Deshmukh',
      actorRole: 'sales_exec',
      action: 'BOOKING_CREATED',
      entityType: 'bookings',
      entityId: 'bk-01',
      details: { bookingCode: 'BK-BLR-2026-01', amountInr: 19425000 },
      ipAddress: '10.24.18.42',
      createdAt: daysAgoIso(15),
    },
    {
      id: 3,
      actorUserId: null,
      actorName: 'WhatsApp Webhook',
      actorRole: 'system',
      action: 'CONSENT_WITHDRAWN',
      entityType: 'consent',
      entityId: 'con-04',
      details: { phone: '+91 97400 19823', keyword: 'STOP', channel: 'whatsapp' },
      ipAddress: '172.16.0.9',
      createdAt: daysAgoIso(18),
    },
  ];

  return {
    roles,
    permissions,
    rolePermissions,
    users,
    projects,
    properties,
    leads,
    customers,
    consent,
    conversations,
    messages,
    siteVisits,
    bookings,
    payments,
    commissions,
    followUps,
    campaigns,
    auditLogs,
  };
}

let dbCache: CrmDatabase | null = null;

export function getDb(): CrmDatabase {
  if (dbCache) return dbCache;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      dbCache = JSON.parse(raw) as CrmDatabase;
      return dbCache;
    } catch {
      // Fallback to fresh seed if corrupted
    }
  }
  dbCache = buildSeedDatabase();
  saveDb();
  return dbCache;
}

export function saveDb(): void {
  if (!dbCache) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(dbCache, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function resetDbForTesting(): void {
  dbCache = buildSeedDatabase();
  saveDb();
}

export function createDatabaseBackup(actorUserId: string, actorName: string, actorRole: string): {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  recordCounts: Record<string, number>;
} {
  const db = getDb();
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `avasa_crm_backup_${stamp}.json`;
  const target = path.join(BACKUP_DIR, filename);

  // Strip password hashes from export backups or keep encrypted snapshot metadata
  const sanitizedSnapshot = {
    exportedAtIst: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    ...db,
    users: db.users.map(({ passwordHash: _ph, ...u }) => u),
  };

  const json = JSON.stringify(sanitizedSnapshot, null, 2);
  fs.writeFileSync(target, json, 'utf8');

  writeAuditLog({
    actorUserId,
    actorName,
    actorRole,
    action: 'DATABASE_BACKUP_CREATED',
    entityType: 'system',
    entityId: filename,
    details: { sizeBytes: Buffer.byteLength(json, 'utf8') },
    ipAddress: '127.0.0.1',
  });

  return {
    filename,
    createdAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(json, 'utf8'),
    recordCounts: {
      leads: db.leads.length,
      customers: db.customers.length,
      projects: db.projects.length,
      properties: db.properties.length,
      bookings: db.bookings.length,
      payments: db.payments.length,
      consent: db.consent.length,
      auditLogs: db.auditLogs.length,
    },
  };
}

export function writeAuditLog(entry: {
  actorUserId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): AuditLogRecord {
  const db = getDb();
  const nextId = db.auditLogs.length ? Math.max(...db.auditLogs.map((a) => a.id)) + 1 : 1;
  const record: AuditLogRecord = {
    id: nextId,
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
    ipAddress: entry.ipAddress ?? '127.0.0.1',
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(record);
  if (db.auditLogs.length > 500) {
    db.auditLogs.length = 500;
  }
  saveDb();
  return record;
}

export function stripPassword(u: StoredUser): UserRecord {
  const { passwordHash: _removed, ...safe } = u;
  return safe;
}

export function canAccessLead(userId: string, roleCode: RoleCode, lead: LeadRecord): boolean {
  if (roleCode === 'admin' || roleCode === 'sales_manager') return true;
  if (roleCode === 'finance') return lead.stage === 'booked';
  return lead.assignedTo === userId;
}

export function canAccessCustomer(userId: string, roleCode: RoleCode, customer: CustomerRecord): boolean {
  if (roleCode === 'admin' || roleCode === 'sales_manager' || roleCode === 'finance') return true;
  return customer.assignedTo === userId;
}

export function isContactOptedOut(phone: string, leadId?: string | null): boolean {
  const db = getDb();
  const normalized = phone.replace(/\s+/g, '');
  return db.consent.some(
    (c) =>
      (c.phone.replace(/\s+/g, '') === normalized || (leadId && c.leadId === leadId)) &&
      (c.status === 'opted_out' || c.status === 'withdrawn')
  );
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

export function computeDashboardMetrics(filters: {
  userId: string;
  roleCode: RoleCode;
  startDate?: string;
  endDate?: string;
  projectId?: string;
  employeeId?: string;
  location?: string;
}): DashboardMetrics {
  const db = getDb();
  const todayIst = formatIstDate(new Date());

  // Enforce row-level security for sales_exec
  const effectiveEmployeeId =
    filters.roleCode === 'sales_exec' ? filters.userId : filters.employeeId || undefined;

  const matchesDate = (iso: string) => {
    const d = formatIstDate(new Date(iso));
    if (filters.startDate && d < filters.startDate) return false;
    if (filters.endDate && d > filters.endDate) return false;
    return true;
  };

  const filteredLeads = db.leads.filter((l) => {
    if (effectiveEmployeeId && l.assignedTo !== effectiveEmployeeId) return false;
    if (filters.projectId && l.projectId !== filters.projectId) return false;
    if (filters.location && l.preferredCity.toLowerCase() !== filters.location.toLowerCase()) return false;
    if (!matchesDate(l.createdAt)) return false;
    return true;
  });

  const leadIdsSet = new Set(filteredLeads.map((l) => l.id));

  const filteredVisits = db.siteVisits.filter((v) => {
    if (effectiveEmployeeId && v.assignedTo !== effectiveEmployeeId) return false;
    if (filters.projectId && v.projectId !== filters.projectId) return false;
    if (filters.location) {
      const prj = db.projects.find((p) => p.id === v.projectId);
      if (prj && prj.city.toLowerCase() !== filters.location.toLowerCase()) return false;
    }
    if (!matchesDate(v.scheduledAt)) return false;
    return true;
  });

  const filteredFollowUps = db.followUps.filter((f) => {
    if (effectiveEmployeeId && f.assignedTo !== effectiveEmployeeId) return false;
    if (filters.projectId || filters.location) {
      if (!leadIdsSet.has(f.leadId)) return false;
    }
    return true;
  });

  const filteredBookings = db.bookings.filter((b) => {
    if (b.status === 'cancelled') return false;
    if (effectiveEmployeeId && b.closedBy !== effectiveEmployeeId) return false;
    if (filters.projectId && b.projectId !== filters.projectId) return false;
    if (filters.location) {
      const prj = db.projects.find((p) => p.id === b.projectId);
      if (prj && prj.city.toLowerCase() !== filters.location.toLowerCase()) return false;
    }
    if (filters.startDate && b.bookingDate < filters.startDate) return false;
    if (filters.endDate && b.bookingDate > filters.endDate) return false;
    return true;
  });

  const bookingIdsSet = new Set(filteredBookings.map((b) => b.id));
  const filteredPayments = db.payments.filter((p) => bookingIdsSet.has(p.bookingId));

  const totalRevenueInr = filteredBookings.reduce((sum, b) => sum + b.totalPayableInr, 0);
  const collectedRevenueInr = filteredPayments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amountInr, 0);
  const pendingPaymentsInr = filteredPayments
    .filter((p) => p.status === 'pending' || p.status === 'overdue')
    .reduce((sum, p) => sum + p.amountInr, 0);

  const totalEnquiries = filteredLeads.length;
  const todaysEnquiries = filteredLeads.filter((l) => formatIstDate(new Date(l.createdAt)) === todayIst).length;
  const conversionRatePct = totalEnquiries > 0 ? Number(((filteredBookings.length / totalEnquiries) * 100).toFixed(1)) : 0;

  // Employee performance
  const salesStaff = db.users.filter((u) => u.roleCode === 'sales_exec' || u.roleCode === 'sales_manager');
  const employeePerformance = salesStaff
    .filter((u) => !effectiveEmployeeId || u.id === effectiveEmployeeId)
    .map((u) => {
      const empLeads = filteredLeads.filter((l) => l.assignedTo === u.id).length;
      const empVisits = filteredVisits.filter((v) => v.assignedTo === u.id && v.status === 'completed').length;
      const empBookings = filteredBookings.filter((b) => b.closedBy === u.id);
      const revenueInr = empBookings.reduce((s, b) => s + b.totalPayableInr, 0);
      const attainmentPct = u.monthlyTargetInr > 0 ? Number(((revenueInr / u.monthlyTargetInr) * 100).toFixed(1)) : 0;
      return {
        employeeId: u.id,
        name: u.fullName,
        city: u.city,
        leadsAssigned: empLeads,
        siteVisitsDone: empVisits,
        bookingsClosed: empBookings.length,
        revenueInr,
        targetInr: u.monthlyTargetInr,
        attainmentPct,
      };
    })
    .sort((a, b) => b.revenueInr - a.revenueInr);

  // Lead Source Analytics
  const sourceMap = new Map<string, { count: number; bookings: number }>();
  for (const l of filteredLeads) {
    const cur = sourceMap.get(l.source) || { count: 0, bookings: 0 };
    cur.count += 1;
    if (l.stage === 'booked') cur.bookings += 1;
    sourceMap.set(l.source, cur);
  }
  const leadSourceAnalytics = Array.from(sourceMap.entries())
    .map(([source, stats]) => ({
      source,
      count: stats.count,
      bookings: stats.bookings,
      conversionPct: stats.count > 0 ? Number(((stats.bookings / stats.count) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Monthly Sales Graph (6-month window anchored around current IST month)
  const monthNames = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const currentMonthIdx = monthNames.length - 1;
  const baselineMonthly = [
    { month: 'Jun', bookings: 2, revenueInr: 31500000, enquiries: 14 },
    { month: 'Jul', bookings: 3, revenueInr: 48200000, enquiries: 19 },
    { month: 'Aug', bookings: 2, revenueInr: 29400000, enquiries: 17 },
    { month: 'Sep', bookings: 4, revenueInr: 64800000, enquiries: 24 },
    { month: 'Oct', bookings: 3, revenueInr: 52100000, enquiries: 21 },
    {
      month: 'Nov',
      bookings: filteredBookings.length,
      revenueInr: totalRevenueInr,
      enquiries: filteredLeads.length,
    },
  ];
  const monthlySalesGraph =
    effectiveEmployeeId || filters.projectId || filters.location
      ? baselineMonthly.map((m, idx) =>
          idx === currentMonthIdx
            ? m
            : {
                month: m.month,
                bookings: Math.max(0, Math.round(m.bookings * 0.35)),
                revenueInr: Math.round(m.revenueInr * 0.35),
                enquiries: Math.max(1, Math.round(m.enquiries * 0.35)),
              }
        )
      : baselineMonthly;

  // Project-wise sales
  const projectWiseSales = db.projects
    .filter((p) => !filters.projectId || p.id === filters.projectId)
    .filter((p) => !filters.location || p.city.toLowerCase() === filters.location.toLowerCase())
    .map((p) => {
      const pBookings = filteredBookings.filter((b) => b.projectId === p.id);
      return {
        projectId: p.id,
        projectName: p.name,
        city: p.city,
        bookingsCount: pBookings.length,
        revenueInr: pBookings.reduce((s, b) => s + b.totalPayableInr, 0),
        availableUnits: p.availableUnits,
        totalUnits: p.totalUnits,
      };
    });

  return {
    kpis: {
      totalEnquiries,
      todaysEnquiries,
      newLeads: filteredLeads.filter((l) => l.stage === 'new').length,
      hotLeads: filteredLeads.filter((l) => l.temperature === 'hot').length,
      warmLeads: filteredLeads.filter((l) => l.temperature === 'warm').length,
      coldLeads: filteredLeads.filter((l) => l.temperature === 'cold').length,
      followUpsPending: filteredFollowUps.filter((f) => f.status === 'pending').length,
      siteVisitsScheduled: filteredVisits.filter((v) => v.status === 'scheduled').length,
      siteVisitsCompleted: filteredVisits.filter((v) => v.status === 'completed').length,
      bookingsConfirmed: filteredBookings.length,
      totalRevenueInr,
      collectedRevenueInr,
      pendingPaymentsInr,
      conversionRatePct,
    },
    employeePerformance,
    leadSourceAnalytics,
    monthlySalesGraph,
    projectWiseSales,
  };
}
