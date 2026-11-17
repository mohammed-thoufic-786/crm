// server.ts
import fs2 from "fs";
import path2 from "path";
import express from "express";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// server/auth.ts
import crypto from "crypto";
var JWT_SECRET = process.env.SESSION_SECRET && process.env.SESSION_SECRET !== "REPLACE_WITH_RANDOM_64_CHAR_HEX_SECRET" ? process.env.SESSION_SECRET : crypto.randomBytes(32).toString("hex");
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, storedHash) {
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}
function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlDecode(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}
function signJwt(payload, ttlSeconds = 60 * 60 * 12) {
  const now = Math.floor(Date.now() / 1e3);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = base64UrlEncode(
    crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}
function verifyJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1e3)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. Missing Bearer token." });
  }
  const token = header.slice("Bearer ".length).trim();
  const payload = verifyJwt(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired authentication token." });
  }
  req.auth = payload;
  next();
}
function requireRoles(...allowed) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!allowed.includes(req.auth.roleCode)) {
      return res.status(403).json({
        error: `Forbidden: Role '${req.auth.roleCode}' is not permitted to perform this operation.`
      });
    }
    next();
  };
}

// server/db.ts
import fs from "fs";
import path from "path";
import crypto2 from "crypto";
var DATA_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "crm-db.json");
var BACKUP_DIR = path.join(DATA_DIR, "backups");
function formatIstDate(date = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
function daysAgoIso(days, hourIst = 10) {
  const d = new Date(Date.now() - days * 864e5);
  d.setUTCHours(hourIst - 5, 30, 0, 0);
  return d.toISOString();
}
function daysAheadIso(days, hourIst = 11) {
  const d = new Date(Date.now() + days * 864e5);
  d.setUTCHours(hourIst - 5, 30, 0, 0);
  return d.toISOString();
}
function buildSeedDatabase() {
  const defaultPwdHash = hashPassword("Avasa@2026!");
  const roles = [
    { id: 1, code: "admin", name: "Company Admin", description: "Full platform governance, RBAC, backups, audit logs, and all customer PII" },
    { id: 2, code: "sales_manager", name: "Sales Manager", description: "Team pipeline oversight, lead assignment, site visits, and marketing campaigns" },
    { id: 3, code: "sales_exec", name: "Sales Executive", description: "Row-level restricted to assigned leads, assigned customers, site visits, and own commissions" },
    { id: 4, code: "finance", name: "Accounts & Finance", description: "Booking ledger, INR milestone collections, GST verification, and commission disbursements" }
  ];
  const permissions = [
    { id: 1, code: "dashboard:view_all", module: "dashboard", description: "View company-wide analytics across all employees" },
    { id: 2, code: "leads:read_all", module: "leads", description: "Read all leads across organization" },
    { id: 3, code: "leads:read_assigned", module: "leads", description: "Read only leads assigned to current user" },
    { id: 4, code: "leads:assign", module: "leads", description: "Assign or reassign leads to sales executives" },
    { id: 5, code: "customers:read_pii", module: "customers", description: "Access customer KYC, phone, email, and masked PAN" },
    { id: 6, code: "properties:manage", module: "properties", description: "Create and update development projects and property units" },
    { id: 7, code: "whatsapp:reply", module: "whatsapp", description: "Send WhatsApp messages and invoke AI assistant" },
    { id: 8, code: "bookings:manage", module: "bookings", description: "Create bookings and reserve inventory" },
    { id: 9, code: "payments:manage", module: "payments", description: "Record INR payments and approve sales commissions" },
    { id: 10, code: "security:audit", module: "security", description: "View audit logs, manage employees, and trigger backups" }
  ];
  const rolePermissions = {
    admin: permissions.map((p) => p.code),
    sales_manager: ["dashboard:view_all", "leads:read_all", "leads:assign", "customers:read_pii", "properties:manage", "whatsapp:reply", "bookings:manage"],
    sales_exec: ["leads:read_assigned", "whatsapp:reply", "bookings:manage"],
    finance: ["dashboard:view_all", "customers:read_pii", "bookings:manage", "payments:manage"]
  };
  const users = [
    {
      id: "usr-admin-01",
      roleId: 1,
      roleCode: "admin",
      roleName: "Company Admin",
      fullName: "Vikramaditya Rao",
      email: "admin@avasarealty.in",
      phone: "+91 98450 11001",
      city: "Bengaluru",
      monthlyTargetInr: 0,
      commissionRatePct: 0,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 9),
      createdAt: daysAgoIso(180),
      passwordHash: defaultPwdHash
    },
    {
      id: "usr-mgr-01",
      roleId: 2,
      roleCode: "sales_manager",
      roleName: "Sales Manager",
      fullName: "Meenakshi Iyer",
      email: "manager@avasarealty.in",
      phone: "+91 98450 11002",
      city: "Bengaluru",
      monthlyTargetInr: 6e7,
      commissionRatePct: 0.75,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 10),
      createdAt: daysAgoIso(170),
      passwordHash: defaultPwdHash
    },
    {
      id: "usr-exec-01",
      roleId: 3,
      roleCode: "sales_exec",
      roleName: "Sales Executive",
      fullName: "Arjun Deshmukh",
      email: "arjun@avasarealty.in",
      phone: "+91 98201 44210",
      city: "Bengaluru",
      monthlyTargetInr: 35e6,
      commissionRatePct: 1.5,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 11),
      createdAt: daysAgoIso(150),
      passwordHash: defaultPwdHash
    },
    {
      id: "usr-exec-02",
      roleId: 3,
      roleCode: "sales_exec",
      roleName: "Sales Executive",
      fullName: "Priya Nair",
      email: "priya@avasarealty.in",
      phone: "+91 98490 77812",
      city: "Hyderabad",
      monthlyTargetInr: 35e6,
      commissionRatePct: 1.5,
      isActive: true,
      lastLoginAt: daysAgoIso(1, 14),
      createdAt: daysAgoIso(140),
      passwordHash: defaultPwdHash
    },
    {
      id: "usr-exec-03",
      roleId: 3,
      roleCode: "sales_exec",
      roleName: "Sales Executive",
      fullName: "Rohan Malhotra",
      email: "rohan@avasarealty.in",
      phone: "+91 98111 33490",
      city: "Gurugram",
      monthlyTargetInr: 4e7,
      commissionRatePct: 1.75,
      isActive: true,
      lastLoginAt: daysAgoIso(1, 16),
      createdAt: daysAgoIso(135),
      passwordHash: defaultPwdHash
    },
    {
      id: "usr-exec-04",
      roleId: 3,
      roleCode: "sales_exec",
      roleName: "Sales Executive",
      fullName: "Sneha Kulkarni",
      email: "sneha@avasarealty.in",
      phone: "+91 98220 55891",
      city: "Pune",
      monthlyTargetInr: 25e6,
      commissionRatePct: 1.5,
      isActive: true,
      lastLoginAt: daysAgoIso(2, 12),
      createdAt: daysAgoIso(120),
      passwordHash: defaultPwdHash
    },
    {
      id: "usr-fin-01",
      roleId: 4,
      roleCode: "finance",
      roleName: "Accounts & Finance",
      fullName: "Siddharth Joshi",
      email: "finance@avasarealty.in",
      phone: "+91 98200 99310",
      city: "Mumbai",
      monthlyTargetInr: 0,
      commissionRatePct: 0,
      isActive: true,
      lastLoginAt: daysAgoIso(0, 10),
      createdAt: daysAgoIso(160),
      passwordHash: defaultPwdHash
    }
  ];
  const projects = [
    {
      id: "prj-01",
      code: "PRJ-BLR-01",
      name: "Avasa Skyline Residences",
      developerName: "Avasa Urban Developers Pvt Ltd",
      reraId: "PRM/KA/RERA/1251/446/PR/240215/006612",
      projectType: "residential",
      city: "Bengaluru",
      microMarket: "Whitefield",
      address: "ITPL Main Road, Whitefield, Bengaluru 560066",
      totalUnits: 240,
      availableUnits: 48,
      basePriceMinInr: 125e5,
      basePriceMaxInr: 265e5,
      possessionDate: "2027-06-30",
      status: "under_construction",
      imageUrl: "/src/assets/images/project_skyline_residences_1794906610259.jpg",
      createdAt: daysAgoIso(200)
    },
    {
      id: "prj-02",
      code: "PRJ-HYD-02",
      name: "Emerald Courtyard Villas",
      developerName: "Avasa Luxury Estates LLP",
      reraId: "P02400007821",
      projectType: "residential",
      city: "Hyderabad",
      microMarket: "Mokila",
      address: "Mokila Villa Corridor, Shankarpally Road, Hyderabad 501203",
      totalUnits: 64,
      availableUnits: 14,
      basePriceMinInr: 34e6,
      basePriceMaxInr: 52e6,
      possessionDate: "2026-12-31",
      status: "ready_to_move",
      imageUrl: "/src/assets/images/project_emerald_villas_1794906611136.jpg",
      createdAt: daysAgoIso(190)
    },
    {
      id: "prj-03",
      code: "PRJ-GGN-03",
      name: "Avasa One Tech Plaza",
      developerName: "Avasa Commercial Realty",
      reraId: "RC/REP/HARERA/GGM/712/444/2025/19",
      projectType: "commercial",
      city: "Gurugram",
      microMarket: "Golf Course Ext Rd",
      address: "Sector 62, Golf Course Extension Road, Gurugram 122102",
      totalUnits: 110,
      availableUnits: 29,
      basePriceMinInr: 185e5,
      basePriceMaxInr: 74e6,
      possessionDate: "2027-03-31",
      status: "under_construction",
      imageUrl: "/src/assets/images/project_tech_park_commercial_1794906610846.jpg",
      createdAt: daysAgoIso(175)
    },
    {
      id: "prj-04",
      code: "PRJ-PUN-04",
      name: "Sahyadri Meadow Plots",
      developerName: "Avasa Landmarks Pvt Ltd",
      reraId: "P52100054329",
      projectType: "plotted_development",
      city: "Pune",
      microMarket: "Hinjewadi Phase 3",
      address: "Marunji-Kasarsai Link Road, Hinjewadi Phase 3, Pune 411057",
      totalUnits: 180,
      availableUnits: 52,
      basePriceMinInr: 62e5,
      basePriceMaxInr: 148e5,
      possessionDate: "2026-09-30",
      status: "ready_to_move",
      imageUrl: "/src/assets/images/project_meadow_plots_1794906611396.jpg",
      createdAt: daysAgoIso(160)
    }
  ];
  const properties = [
    {
      id: "prop-01",
      projectId: "prj-01",
      unitCode: "BLR-A-1402",
      title: "Skyline Tower A \u2014 3 BHK Corner Skyhome",
      category: "apartment",
      transactionType: "primary_sale",
      city: "Bengaluru",
      locality: "Whitefield",
      configuration: "3 BHK + Study",
      carpetAreaSqft: 1480,
      superBuiltupSqft: 2050,
      facing: "East",
      floorNumber: 14,
      priceInr: 185e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "unfurnished",
      status: "booked",
      createdAt: daysAgoIso(90)
    },
    {
      id: "prop-02",
      projectId: "prj-01",
      unitCode: "BLR-B-1904",
      title: "Skyline Tower B \u2014 3 BHK Garden View",
      category: "apartment",
      transactionType: "primary_sale",
      city: "Bengaluru",
      locality: "Whitefield",
      configuration: "3 BHK",
      carpetAreaSqft: 1320,
      superBuiltupSqft: 1810,
      facing: "North-East",
      floorNumber: 19,
      priceInr: 162e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "unfurnished",
      status: "available",
      createdAt: daysAgoIso(85)
    },
    {
      id: "prop-03",
      projectId: "prj-02",
      unitCode: "HYD-V-09",
      title: "Emerald Courtyard \u2014 4 BHK Private Pool Villa",
      category: "villa",
      transactionType: "primary_sale",
      city: "Hyderabad",
      locality: "Mokila",
      configuration: "4 BHK Triplex Villa",
      carpetAreaSqft: 3200,
      superBuiltupSqft: 4150,
      facing: "North",
      floorNumber: 0,
      priceInr: 425e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "semi_furnished",
      status: "booked",
      createdAt: daysAgoIso(80)
    },
    {
      id: "prop-04",
      projectId: "prj-02",
      unitCode: "HYD-V-14",
      title: "Emerald Courtyard \u2014 4 BHK Corner Lawn Villa",
      category: "villa",
      transactionType: "primary_sale",
      city: "Hyderabad",
      locality: "Mokila",
      configuration: "4 BHK Villa",
      carpetAreaSqft: 2950,
      superBuiltupSqft: 3800,
      facing: "East",
      floorNumber: 0,
      priceInr: 378e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "semi_furnished",
      status: "available",
      createdAt: daysAgoIso(75)
    },
    {
      id: "prop-05",
      projectId: "prj-03",
      unitCode: "GGN-C-704",
      title: "Avasa One Tech Plaza \u2014 Grade-A Corner Office",
      category: "commercial",
      transactionType: "primary_sale",
      city: "Gurugram",
      locality: "Sector 62",
      configuration: "3,100 sq.ft Office Suite",
      carpetAreaSqft: 2350,
      superBuiltupSqft: 3100,
      facing: "North-East",
      floorNumber: 7,
      priceInr: 372e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "semi_furnished",
      status: "booked",
      createdAt: daysAgoIso(70)
    },
    {
      id: "prop-06",
      projectId: "prj-03",
      unitCode: "GGN-R-003",
      title: "Avasa One Plaza \u2014 High-Street Retail Flagship",
      category: "commercial",
      transactionType: "primary_sale",
      city: "Gurugram",
      locality: "Sector 62",
      configuration: "1,850 sq.ft Ground Retail",
      carpetAreaSqft: 1480,
      superBuiltupSqft: 1850,
      facing: "North",
      floorNumber: 0,
      priceInr: 445e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "unfurnished",
      status: "available",
      createdAt: daysAgoIso(65)
    },
    {
      id: "prop-07",
      projectId: "prj-04",
      unitCode: "PUN-P-118",
      title: "Sahyadri Meadows \u2014 Corner NA Residential Plot",
      category: "plot_land",
      transactionType: "primary_sale",
      city: "Pune",
      locality: "Hinjewadi Phase 3",
      configuration: "2,400 sq.ft NA Plot",
      carpetAreaSqft: 2400,
      superBuiltupSqft: 2400,
      facing: "East",
      floorNumber: 0,
      priceInr: 96e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "unfurnished",
      status: "booked",
      createdAt: daysAgoIso(60)
    },
    {
      id: "prop-08",
      projectId: "prj-04",
      unitCode: "PUN-P-142",
      title: "Sahyadri Meadows \u2014 Park-Facing Villa Plot",
      category: "plot_land",
      transactionType: "primary_sale",
      city: "Pune",
      locality: "Hinjewadi Phase 3",
      configuration: "3,000 sq.ft Plot",
      carpetAreaSqft: 3e3,
      superBuiltupSqft: 3e3,
      facing: "North",
      floorNumber: 0,
      priceInr: 124e5,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "unfurnished",
      status: "available",
      createdAt: daysAgoIso(55)
    },
    {
      id: "prop-09",
      projectId: null,
      unitCode: "MUM-RNT-22",
      title: "Worli Sea-View Furnished 3 BHK Corporate Lease",
      category: "residential",
      transactionType: "rental",
      city: "Mumbai",
      locality: "Worli",
      configuration: "3 BHK Luxury Rental",
      carpetAreaSqft: 1520,
      superBuiltupSqft: 1980,
      facing: "West",
      floorNumber: 22,
      priceInr: 95e6,
      monthlyRentInr: 185e3,
      securityDepositInr: 925e3,
      furnishing: "fully_furnished",
      status: "available",
      createdAt: daysAgoIso(45)
    },
    {
      id: "prop-10",
      projectId: null,
      unitCode: "BLR-RSL-08",
      title: "Indiranagar 100ft Rd Boutique Resale Residence",
      category: "residential",
      transactionType: "resale",
      city: "Bengaluru",
      locality: "Indiranagar",
      configuration: "4 BHK Resale Independent",
      carpetAreaSqft: 2900,
      superBuiltupSqft: 3400,
      facing: "North",
      floorNumber: 0,
      priceInr: 56e6,
      monthlyRentInr: null,
      securityDepositInr: null,
      furnishing: "fully_furnished",
      status: "available",
      createdAt: daysAgoIso(40)
    }
  ];
  const leads = [
    {
      id: "lead-01",
      leadCode: "AVS-2026-101",
      fullName: "Karthik Subramanian",
      phone: "+91 98452 33190",
      email: "karthik.s@techmail.in",
      preferredLanguage: "en",
      source: "whatsapp",
      temperature: "hot",
      stage: "booked",
      interestedCategory: "apartment",
      transactionIntent: "primary_sale",
      preferredCity: "Bengaluru",
      preferredLocality: "Whitefield",
      budgetMinInr: 15e6,
      budgetMaxInr: 2e7,
      projectId: "prj-01",
      assignedTo: "usr-exec-01",
      aiSummary: "VP Engineering looking for East-facing 3 BHK near ITPL. Booked Tower A 1402.",
      lastContactedAt: daysAgoIso(1, 16),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(42),
      updatedAt: daysAgoIso(1)
    },
    {
      id: "lead-02",
      leadCode: "AVS-2026-102",
      fullName: "Ananya Reddy",
      phone: "+91 99890 12045",
      email: "ananya.reddy@hydventure.in",
      preferredLanguage: "en",
      source: "99acres",
      temperature: "hot",
      stage: "booked",
      interestedCategory: "villa",
      transactionIntent: "primary_sale",
      preferredCity: "Hyderabad",
      preferredLocality: "Mokila",
      budgetMinInr: 35e6,
      budgetMaxInr: 45e6,
      projectId: "prj-02",
      assignedTo: "usr-exec-02",
      aiSummary: "NRI family relocating to Hyderabad; confirmed Villa HYD-V-09.",
      lastContactedAt: daysAgoIso(2, 15),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(38),
      updatedAt: daysAgoIso(2)
    },
    {
      id: "lead-03",
      leadCode: "AVS-2026-103",
      fullName: "Rajeshwari Kapoor",
      phone: "+91 98104 88721",
      email: "r.kapoor@delhicorp.in",
      preferredLanguage: "hi",
      source: "google_ads",
      temperature: "hot",
      stage: "booked",
      interestedCategory: "commercial",
      transactionIntent: "primary_sale",
      preferredCity: "Gurugram",
      preferredLocality: "Sector 62",
      budgetMinInr: 3e7,
      budgetMaxInr: 42e6,
      projectId: "prj-03",
      assignedTo: "usr-exec-03",
      aiSummary: "CA firm acquiring 3,100 sq.ft Grade-A corporate office on Golf Course Ext Rd.",
      lastContactedAt: daysAgoIso(3, 14),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(31),
      updatedAt: daysAgoIso(3)
    },
    {
      id: "lead-04",
      leadCode: "AVS-2026-104",
      fullName: "Prashant Bhosale",
      phone: "+91 97654 22109",
      email: "prashant.b@puneforge.in",
      preferredLanguage: "mr",
      source: "magicbricks",
      temperature: "hot",
      stage: "booked",
      interestedCategory: "plot_land",
      transactionIntent: "primary_sale",
      preferredCity: "Pune",
      preferredLocality: "Hinjewadi Phase 3",
      budgetMinInr: 8e6,
      budgetMaxInr: 12e6,
      projectId: "prj-04",
      assignedTo: "usr-exec-04",
      aiSummary: "Bought corner NA plot PUN-P-118; loan pre-approved with SBI.",
      lastContactedAt: daysAgoIso(4, 12),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(25),
      updatedAt: daysAgoIso(4)
    },
    {
      id: "lead-05",
      leadCode: "AVS-2026-105",
      fullName: "Nikhil Sharma",
      phone: "+91 98801 66742",
      email: "nikhil.sharma@fintech.co.in",
      preferredLanguage: "hi-Latn",
      source: "whatsapp",
      temperature: "hot",
      stage: "negotiation",
      interestedCategory: "apartment",
      transactionIntent: "primary_sale",
      preferredCity: "Bengaluru",
      preferredLocality: "Whitefield",
      budgetMinInr: 14e6,
      budgetMaxInr: 175e5,
      projectId: "prj-01",
      assignedTo: "usr-exec-01",
      aiSummary: "Visited Skyline Residences twice; negotiating floor-rise waiver on BLR-B-1904.",
      lastContactedAt: daysAgoIso(0, 12),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(12),
      updatedAt: daysAgoIso(0)
    },
    {
      id: "lead-06",
      leadCode: "AVS-2026-106",
      fullName: "Deepika Venkatesh",
      phone: "+91 98401 44512",
      email: "deepika.v@chennaiholdings.in",
      preferredLanguage: "ta",
      source: "meta_ads",
      temperature: "hot",
      stage: "site_visit_scheduled",
      interestedCategory: "villa",
      transactionIntent: "primary_sale",
      preferredCity: "Hyderabad",
      preferredLocality: "Mokila",
      budgetMinInr: 32e6,
      budgetMaxInr: 4e7,
      projectId: "prj-02",
      assignedTo: "usr-exec-02",
      aiSummary: "Tamil-speaking buyer exploring Emerald Courtyard 4 BHK corner villa; weekend visit booked.",
      lastContactedAt: daysAgoIso(0, 10),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(4),
      updatedAt: daysAgoIso(0)
    },
    {
      id: "lead-07",
      leadCode: "AVS-2026-107",
      fullName: "Harshvardhan Mehta",
      phone: "+91 98204 71200",
      email: "h.mehta@mumbaiassets.in",
      preferredLanguage: "gu",
      source: "referral",
      temperature: "warm",
      stage: "site_visit_done",
      interestedCategory: "residential",
      transactionIntent: "rental",
      preferredCity: "Mumbai",
      preferredLocality: "Worli",
      budgetMinInr: 16e4,
      budgetMaxInr: 2e5,
      projectId: null,
      assignedTo: "usr-exec-01",
      aiSummary: "Corporate MD looking for Worli sea-facing 3 BHK lease at \u20B91.85L/month.",
      lastContactedAt: daysAgoIso(1, 17),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(9),
      updatedAt: daysAgoIso(1)
    },
    {
      id: "lead-08",
      leadCode: "AVS-2026-108",
      fullName: "Gaurav Taneja",
      phone: "+91 99100 55432",
      email: "gaurav.t@ncrretail.in",
      preferredLanguage: "hi",
      source: "housing_com",
      temperature: "warm",
      stage: "qualified",
      interestedCategory: "commercial",
      transactionIntent: "primary_sale",
      preferredCity: "Gurugram",
      preferredLocality: "Sector 62",
      budgetMinInr: 35e6,
      budgetMaxInr: 48e6,
      projectId: "prj-03",
      assignedTo: "usr-exec-03",
      aiSummary: "Interested in high-street ground retail unit GGN-R-003 for flagship caf\xE9.",
      lastContactedAt: daysAgoIso(2, 11),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(7),
      updatedAt: daysAgoIso(2)
    },
    {
      id: "lead-09",
      leadCode: "AVS-2026-109",
      fullName: "Kavita Deshpande",
      phone: "+91 98230 90122",
      email: "kavita.d@puneit.in",
      preferredLanguage: "mr",
      source: "website",
      temperature: "warm",
      stage: "contacted",
      interestedCategory: "plot_land",
      transactionIntent: "primary_sale",
      preferredCity: "Pune",
      preferredLocality: "Hinjewadi Phase 3",
      budgetMinInr: 9e6,
      budgetMaxInr: 135e5,
      projectId: "prj-04",
      assignedTo: "usr-exec-04",
      aiSummary: "Requested RERA layout plan & 3,000 sq.ft park-facing plot pricing.",
      lastContactedAt: daysAgoIso(3, 15),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(6),
      updatedAt: daysAgoIso(3)
    },
    {
      id: "lead-10",
      leadCode: "AVS-2026-110",
      fullName: "Aarav Singhal",
      phone: "+91 96111 88201",
      email: "aarav.singhal@startup.in",
      preferredLanguage: "en",
      source: "whatsapp",
      temperature: "hot",
      stage: "new",
      interestedCategory: "residential",
      transactionIntent: "resale",
      preferredCity: "Bengaluru",
      preferredLocality: "Indiranagar",
      budgetMinInr: 5e7,
      budgetMaxInr: 6e7,
      projectId: null,
      assignedTo: "usr-exec-01",
      aiSummary: "Inbound today via WhatsApp asking for Indiranagar resale independent home.",
      lastContactedAt: daysAgoIso(0, 9),
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(0, 9),
      updatedAt: daysAgoIso(0, 9)
    },
    {
      id: "lead-11",
      leadCode: "AVS-2026-111",
      fullName: "Srinivas Rao",
      phone: "+91 98480 61234",
      email: "srinivas.rao@hydcloud.in",
      preferredLanguage: "te",
      source: "meta_ads",
      temperature: "warm",
      stage: "new",
      interestedCategory: "villa",
      transactionIntent: "primary_sale",
      preferredCity: "Hyderabad",
      preferredLocality: "Mokila",
      budgetMinInr: 32e6,
      budgetMaxInr: 42e6,
      projectId: "prj-02",
      assignedTo: "usr-exec-02",
      aiSummary: "Today enquiry from Meta Ads; requested Telugu brochure for Emerald Courtyard.",
      lastContactedAt: null,
      retentionExpiresAt: daysAheadIso(365),
      createdAt: daysAgoIso(0, 10),
      updatedAt: daysAgoIso(0, 10)
    },
    {
      id: "lead-12",
      leadCode: "AVS-2026-112",
      fullName: "Manoj Tiwari",
      phone: "+91 98991 34120",
      email: "manoj.tiwari@mail.in",
      preferredLanguage: "hi",
      source: "99acres",
      temperature: "cold",
      stage: "contacted",
      interestedCategory: "commercial",
      transactionIntent: "primary_sale",
      preferredCity: "Gurugram",
      preferredLocality: "Sector 62",
      budgetMinInr: 18e6,
      budgetMaxInr: 22e6,
      projectId: "prj-03",
      assignedTo: "usr-exec-03",
      aiSummary: "Exploring Q1 2027 commercial investment; requested follow-up next quarter.",
      lastContactedAt: daysAgoIso(14),
      retentionExpiresAt: daysAheadIso(330),
      createdAt: daysAgoIso(21),
      updatedAt: daysAgoIso(14)
    },
    {
      id: "lead-13",
      leadCode: "AVS-2026-113",
      fullName: "Shruti Hegde",
      phone: "+91 97400 19823",
      email: "shruti.hegde@bengaluru.in",
      preferredLanguage: "kn",
      source: "walk_in",
      temperature: "cold",
      stage: "lost",
      interestedCategory: "apartment",
      transactionIntent: "primary_sale",
      preferredCity: "Bengaluru",
      preferredLocality: "Whitefield",
      budgetMinInr: 11e6,
      budgetMaxInr: 13e6,
      projectId: "prj-01",
      assignedTo: "usr-exec-01",
      aiSummary: "Postponed purchase decision; opted out of promotional messages.",
      lastContactedAt: daysAgoIso(18),
      retentionExpiresAt: daysAheadIso(300),
      createdAt: daysAgoIso(35),
      updatedAt: daysAgoIso(18)
    }
  ];
  const customers = [
    {
      id: "cust-01",
      leadId: "lead-01",
      assignedTo: "usr-exec-01",
      fullName: "Karthik Subramanian",
      phone: "+91 98452 33190",
      email: "karthik.s@techmail.in",
      panMasked: "ABCPK****7M",
      city: "Bengaluru",
      correspondenceAddress: "42, HAL 2nd Stage, Indiranagar, Bengaluru 560038",
      kycVerified: true,
      createdAt: daysAgoIso(15)
    },
    {
      id: "cust-02",
      leadId: "lead-02",
      assignedTo: "usr-exec-02",
      fullName: "Ananya Reddy",
      phone: "+91 99890 12045",
      email: "ananya.reddy@hydventure.in",
      panMasked: "BGHPR****2Q",
      city: "Hyderabad",
      correspondenceAddress: "Plot 18, Jubilee Hills Road No. 45, Hyderabad 500033",
      kycVerified: true,
      createdAt: daysAgoIso(12)
    },
    {
      id: "cust-03",
      leadId: "lead-03",
      assignedTo: "usr-exec-03",
      fullName: "Rajeshwari Kapoor",
      phone: "+91 98104 88721",
      email: "r.kapoor@delhicorp.in",
      panMasked: "AAACK****9L",
      city: "Gurugram",
      correspondenceAddress: "DLF Phase 2, Tower M-4, Gurugram 122002",
      kycVerified: true,
      createdAt: daysAgoIso(9)
    },
    {
      id: "cust-04",
      leadId: "lead-04",
      assignedTo: "usr-exec-04",
      fullName: "Prashant Bhosale",
      phone: "+91 97654 22109",
      email: "prashant.b@puneforge.in",
      panMasked: "ADGPB****4D",
      city: "Pune",
      correspondenceAddress: "Baner Balewadi High Street, Pune 411045",
      kycVerified: true,
      createdAt: daysAgoIso(7)
    }
  ];
  const consent = [
    {
      id: "con-01",
      leadId: "lead-05",
      customerId: null,
      contactName: "Nikhil Sharma",
      phone: "+91 98801 66742",
      channel: "whatsapp",
      purpose: "sales_followup",
      status: "granted",
      sourceProof: "WhatsApp Opt-In Keyword & Website Form #W-882",
      grantedAt: daysAgoIso(12),
      withdrawnAt: null,
      updatedAt: daysAgoIso(12)
    },
    {
      id: "con-02",
      leadId: "lead-06",
      customerId: null,
      contactName: "Deepika Venkatesh",
      phone: "+91 98401 44512",
      channel: "whatsapp",
      purpose: "ai_chatbot",
      status: "granted",
      sourceProof: "Meta Lead Ad Consent Checkbox #MA-410",
      grantedAt: daysAgoIso(4),
      withdrawnAt: null,
      updatedAt: daysAgoIso(4)
    },
    {
      id: "con-03",
      leadId: "lead-10",
      customerId: null,
      contactName: "Aarav Singhal",
      phone: "+91 96111 88201",
      channel: "whatsapp",
      purpose: "sales_followup",
      status: "granted",
      sourceProof: "Inbound WhatsApp Initiation",
      grantedAt: daysAgoIso(0, 9),
      withdrawnAt: null,
      updatedAt: daysAgoIso(0, 9)
    },
    {
      id: "con-04",
      leadId: "lead-13",
      customerId: null,
      contactName: "Shruti Hegde",
      phone: "+91 97400 19823",
      channel: "whatsapp",
      purpose: "marketing_campaigns",
      status: "opted_out",
      sourceProof: "Customer replied STOP on WhatsApp",
      grantedAt: daysAgoIso(35),
      withdrawnAt: daysAgoIso(18),
      updatedAt: daysAgoIso(18)
    },
    {
      id: "con-05",
      leadId: "lead-01",
      customerId: "cust-01",
      contactName: "Karthik Subramanian",
      phone: "+91 98452 33190",
      channel: "whatsapp",
      purpose: "kyc_processing",
      status: "granted",
      sourceProof: "Signed Booking Form DPDP Clause #BK-101",
      grantedAt: daysAgoIso(15),
      withdrawnAt: null,
      updatedAt: daysAgoIso(15)
    }
  ];
  const conversations = [
    {
      id: "conv-01",
      leadId: "lead-05",
      assignedTo: "usr-exec-01",
      channel: "whatsapp",
      waPhone: "+91 98801 66742",
      detectedLanguage: "hi-Latn",
      aiEnabled: true,
      status: "open",
      lastMessageAt: daysAgoIso(0, 12),
      createdAt: daysAgoIso(12)
    },
    {
      id: "conv-02",
      leadId: "lead-06",
      assignedTo: "usr-exec-02",
      channel: "whatsapp",
      waPhone: "+91 98401 44512",
      detectedLanguage: "ta",
      aiEnabled: true,
      status: "open",
      lastMessageAt: daysAgoIso(0, 10),
      createdAt: daysAgoIso(4)
    },
    {
      id: "conv-03",
      leadId: "lead-10",
      assignedTo: "usr-exec-01",
      channel: "whatsapp",
      waPhone: "+91 96111 88201",
      detectedLanguage: "en",
      aiEnabled: true,
      status: "open",
      lastMessageAt: daysAgoIso(0, 9),
      createdAt: daysAgoIso(0, 9)
    },
    {
      id: "conv-04",
      leadId: "lead-13",
      assignedTo: "usr-exec-01",
      channel: "whatsapp",
      waPhone: "+91 97400 19823",
      detectedLanguage: "en",
      aiEnabled: false,
      status: "opted_out",
      lastMessageAt: daysAgoIso(18),
      createdAt: daysAgoIso(35)
    }
  ];
  const messages = [
    {
      id: "msg-01",
      conversationId: "conv-01",
      direction: "inbound",
      senderType: "customer",
      senderUserId: null,
      body: "Hi, Whitefield mein 3 BHK flat chahiye around 1.6 Cr budget. Tower B ka floor rise discount milega kya?",
      languageCode: "hi-Latn",
      waMessageId: "wamid.HBgMOTE5ODgwMTY2NzQy",
      deliveryStatus: "read",
      createdAt: daysAgoIso(0, 11)
    },
    {
      id: "msg-02",
      conversationId: "conv-01",
      direction: "outbound",
      senderType: "ai_bot",
      senderUserId: null,
      body: "Namaste Nikhil ji! Avasa Skyline Residences (Whitefield, RERA: PRM/KA/RERA/1251/446/PR/240215/006612) mein hamare paas Unit BLR-B-1904 (3 BHK, 1,810 sq.ft, North-East facing) \u20B91.62 Cr mein available hai. Floor-rise waiver ke liye Arjun Deshmukh aaj 4 PM IST call par final offer share karenge.",
      languageCode: "hi-Latn",
      waMessageId: "wamid.AI0012",
      deliveryStatus: "delivered",
      createdAt: daysAgoIso(0, 12)
    },
    {
      id: "msg-03",
      conversationId: "conv-02",
      direction: "inbound",
      senderType: "customer",
      senderUserId: null,
      body: "\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD, \u0BB9\u0BC8\u0BA4\u0BB0\u0BBE\u0BAA\u0BBE\u0BA4\u0BCD Mokila-\u0BB5\u0BBF\u0BB2\u0BCD 4 BHK \u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BBE \u0BB5\u0BBF\u0BB2\u0BC8 \u0B8E\u0BA9\u0BCD\u0BA9? \u0B87\u0BA8\u0BCD\u0BA4 \u0BB5\u0BBE\u0BB0 \u0B87\u0BB1\u0BC1\u0BA4\u0BBF\u0BAF\u0BBF\u0BB2\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95 \u0BAE\u0BC1\u0B9F\u0BBF\u0BAF\u0BC1\u0BAE\u0BBE?",
      languageCode: "ta",
      waMessageId: "wamid.TA0091",
      deliveryStatus: "read",
      createdAt: daysAgoIso(0, 10)
    },
    {
      id: "msg-04",
      conversationId: "conv-02",
      direction: "outbound",
      senderType: "ai_bot",
      senderUserId: null,
      body: "\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD \u0BA4\u0BC0\u0BAA\u0BBF\u0B95\u0BBE! Emerald Courtyard Villas (Mokila, RERA: P02400007821) \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD 4 BHK Corner Lawn Villa (3,800 sq.ft, \u0B95\u0BBF\u0BB4\u0B95\u0BCD\u0B95\u0BC1 \u0BA4\u0BBF\u0B9A\u0BC8) \u20B93.78 Cr \u0BB5\u0BBF\u0BB2\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD \u0BA4\u0BAF\u0BBE\u0BB0\u0BBE\u0B95 \u0B89\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1. \u0B9A\u0BA9\u0BBF\u0B95\u0BCD\u0B95\u0BBF\u0BB4\u0BAE\u0BC8 \u0B95\u0BBE\u0BB2\u0BC8 11:00 \u0BAE\u0BA3\u0BBF\u0B95\u0BCD\u0B95\u0BC1 \u0BA8\u0BC7\u0BB0\u0BBF\u0BB2\u0BCD \u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95 \u0B8F\u0BB1\u0BCD\u0BAA\u0BBE\u0B9F\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BC1\u0BB3\u0BCD\u0BB3\u0BCB\u0BAE\u0BCD.",
      languageCode: "ta",
      waMessageId: "wamid.AI0013",
      deliveryStatus: "delivered",
      createdAt: daysAgoIso(0, 10)
    },
    {
      id: "msg-05",
      conversationId: "conv-03",
      direction: "inbound",
      senderType: "customer",
      senderUserId: null,
      body: "Looking for an independent resale house in Indiranagar 100ft road around 5.5 Cr. Any verified options?",
      languageCode: "en",
      waMessageId: "wamid.EN1102",
      deliveryStatus: "read",
      createdAt: daysAgoIso(0, 9)
    },
    {
      id: "msg-06",
      conversationId: "conv-04",
      direction: "inbound",
      senderType: "customer",
      senderUserId: null,
      body: "STOP",
      languageCode: "en",
      waMessageId: "wamid.OPT991",
      deliveryStatus: "read",
      createdAt: daysAgoIso(18)
    }
  ];
  const siteVisits = [
    {
      id: "sv-01",
      leadId: "lead-01",
      projectId: "prj-01",
      propertyId: "prop-01",
      assignedTo: "usr-exec-01",
      scheduledAt: daysAgoIso(20, 11),
      completedAt: daysAgoIso(20, 12),
      status: "completed",
      pickupRequired: false,
      feedback: "Loved the podium garden & corner ventilation in Tower A.",
      rating: 5,
      createdAt: daysAgoIso(24)
    },
    {
      id: "sv-02",
      leadId: "lead-02",
      projectId: "prj-02",
      propertyId: "prop-03",
      assignedTo: "usr-exec-02",
      scheduledAt: daysAgoIso(16, 10),
      completedAt: daysAgoIso(16, 11),
      status: "completed",
      pickupRequired: true,
      feedback: "Approved courtyard layout & ready-to-move finishing quality.",
      rating: 5,
      createdAt: daysAgoIso(19)
    },
    {
      id: "sv-03",
      leadId: "lead-05",
      projectId: "prj-01",
      propertyId: "prop-02",
      assignedTo: "usr-exec-01",
      scheduledAt: daysAgoIso(3, 16),
      completedAt: daysAgoIso(3, 17),
      status: "completed",
      pickupRequired: false,
      feedback: "Shortlisted 19th floor unit; awaiting final pricing approval.",
      rating: 4,
      createdAt: daysAgoIso(6)
    },
    {
      id: "sv-04",
      leadId: "lead-06",
      projectId: "prj-02",
      propertyId: "prop-04",
      assignedTo: "usr-exec-02",
      scheduledAt: daysAheadIso(2, 11),
      completedAt: null,
      status: "scheduled",
      pickupRequired: true,
      feedback: null,
      rating: null,
      createdAt: daysAgoIso(1)
    },
    {
      id: "sv-05",
      leadId: "lead-08",
      projectId: "prj-03",
      propertyId: "prop-06",
      assignedTo: "usr-exec-03",
      scheduledAt: daysAheadIso(1, 15),
      completedAt: null,
      status: "scheduled",
      pickupRequired: false,
      feedback: null,
      rating: null,
      createdAt: daysAgoIso(2)
    }
  ];
  const bookings = [
    {
      id: "bk-01",
      bookingCode: "BK-BLR-2026-01",
      leadId: "lead-01",
      customerId: "cust-01",
      projectId: "prj-01",
      propertyId: "prop-01",
      closedBy: "usr-exec-01",
      agreementValueInr: 185e5,
      gstAmountInr: 925e3,
      totalPayableInr: 19425e3,
      bookingDate: formatIstDate(new Date(Date.now() - 15 * 864e5)),
      status: "confirmed",
      retentionUntil: "2034-11-17",
      createdAt: daysAgoIso(15)
    },
    {
      id: "bk-02",
      bookingCode: "BK-HYD-2026-02",
      leadId: "lead-02",
      customerId: "cust-02",
      projectId: "prj-02",
      propertyId: "prop-03",
      closedBy: "usr-exec-02",
      agreementValueInr: 425e5,
      gstAmountInr: 0,
      // OC received ready-to-move exempt from GST
      totalPayableInr: 425e5,
      bookingDate: formatIstDate(new Date(Date.now() - 12 * 864e5)),
      status: "registered",
      retentionUntil: "2034-11-17",
      createdAt: daysAgoIso(12)
    },
    {
      id: "bk-03",
      bookingCode: "BK-GGN-2026-03",
      leadId: "lead-03",
      customerId: "cust-03",
      projectId: "prj-03",
      propertyId: "prop-05",
      closedBy: "usr-exec-03",
      agreementValueInr: 372e5,
      gstAmountInr: 4464e3,
      // 12% Commercial GST
      totalPayableInr: 41664e3,
      bookingDate: formatIstDate(new Date(Date.now() - 9 * 864e5)),
      status: "confirmed",
      retentionUntil: "2034-11-17",
      createdAt: daysAgoIso(9)
    },
    {
      id: "bk-04",
      bookingCode: "BK-PUN-2026-04",
      leadId: "lead-04",
      customerId: "cust-04",
      projectId: "prj-04",
      propertyId: "prop-07",
      closedBy: "usr-exec-04",
      agreementValueInr: 96e5,
      gstAmountInr: 0,
      // Land / plot exempt from GST
      totalPayableInr: 96e5,
      bookingDate: formatIstDate(new Date(Date.now() - 7 * 864e5)),
      status: "confirmed",
      retentionUntil: "2034-11-17",
      createdAt: daysAgoIso(7)
    }
  ];
  const payments = [
    {
      id: "pay-01",
      bookingId: "bk-01",
      milestoneName: "Booking Token (10%)",
      amountInr: 1942500,
      dueDate: formatIstDate(new Date(Date.now() - 14 * 864e5)),
      paidDate: formatIstDate(new Date(Date.now() - 14 * 864e5)),
      paymentMode: "neft_rtgs",
      utrReference: "HDFCR5202611039812",
      status: "paid",
      createdAt: daysAgoIso(14)
    },
    {
      id: "pay-02",
      bookingId: "bk-01",
      milestoneName: "Agreement Execution (20%)",
      amountInr: 3885e3,
      dueDate: formatIstDate(new Date(Date.now() + 7 * 864e5)),
      paidDate: null,
      paymentMode: null,
      utrReference: null,
      status: "pending",
      createdAt: daysAgoIso(14)
    },
    {
      id: "pay-03",
      bookingId: "bk-02",
      milestoneName: "Initial Down Payment (50%)",
      amountInr: 2125e4,
      dueDate: formatIstDate(new Date(Date.now() - 10 * 864e5)),
      paidDate: formatIstDate(new Date(Date.now() - 10 * 864e5)),
      paymentMode: "home_loan_disbursement",
      utrReference: "ICICHL202611070019",
      status: "paid",
      createdAt: daysAgoIso(10)
    },
    {
      id: "pay-04",
      bookingId: "bk-02",
      milestoneName: "Registration & Handover (50%)",
      amountInr: 2125e4,
      dueDate: formatIstDate(new Date(Date.now() - 3 * 864e5)),
      paidDate: formatIstDate(new Date(Date.now() - 3 * 864e5)),
      paymentMode: "neft_rtgs",
      utrReference: "SBINR1202611145520",
      status: "paid",
      createdAt: daysAgoIso(3)
    },
    {
      id: "pay-05",
      bookingId: "bk-03",
      milestoneName: "Corporate Booking Advance (25%)",
      amountInr: 10416e3,
      dueDate: formatIstDate(new Date(Date.now() - 7 * 864e5)),
      paidDate: formatIstDate(new Date(Date.now() - 7 * 864e5)),
      paymentMode: "neft_rtgs",
      utrReference: "AXISR4202611108841",
      status: "paid",
      createdAt: daysAgoIso(7)
    },
    {
      id: "pay-06",
      bookingId: "bk-03",
      milestoneName: "Fit-out & Slab Milestone (25%)",
      amountInr: 10416e3,
      dueDate: formatIstDate(new Date(Date.now() - 1 * 864e5)),
      paidDate: null,
      paymentMode: null,
      utrReference: null,
      status: "overdue",
      createdAt: daysAgoIso(7)
    },
    {
      id: "pay-07",
      bookingId: "bk-04",
      milestoneName: "Plot Allotment & 40% Payment",
      amountInr: 384e4,
      dueDate: formatIstDate(new Date(Date.now() - 5 * 864e5)),
      paidDate: formatIstDate(new Date(Date.now() - 5 * 864e5)),
      paymentMode: "upi",
      utrReference: "UPI632189440128",
      status: "paid",
      createdAt: daysAgoIso(5)
    },
    {
      id: "pay-08",
      bookingId: "bk-04",
      milestoneName: "Sale Deed Balance (60%)",
      amountInr: 576e4,
      dueDate: formatIstDate(new Date(Date.now() + 14 * 864e5)),
      paidDate: null,
      paymentMode: null,
      utrReference: null,
      status: "pending",
      createdAt: daysAgoIso(5)
    }
  ];
  const commissions = [
    {
      id: "com-01",
      bookingId: "bk-01",
      employeeId: "usr-exec-01",
      commissionRatePct: 1.5,
      grossAmountInr: 277500,
      tdsDeductedInr: 13875,
      netPayableInr: 263625,
      status: "approved",
      approvedBy: "usr-fin-01",
      paidAt: null,
      createdAt: daysAgoIso(14)
    },
    {
      id: "com-02",
      bookingId: "bk-02",
      employeeId: "usr-exec-02",
      commissionRatePct: 1.5,
      grossAmountInr: 637500,
      tdsDeductedInr: 31875,
      netPayableInr: 605625,
      status: "paid",
      approvedBy: "usr-fin-01",
      paidAt: daysAgoIso(2),
      createdAt: daysAgoIso(11)
    },
    {
      id: "com-03",
      bookingId: "bk-03",
      employeeId: "usr-exec-03",
      commissionRatePct: 1.75,
      grossAmountInr: 651e3,
      tdsDeductedInr: 32550,
      netPayableInr: 618450,
      status: "pending",
      approvedBy: null,
      paidAt: null,
      createdAt: daysAgoIso(8)
    },
    {
      id: "com-04",
      bookingId: "bk-04",
      employeeId: "usr-exec-04",
      commissionRatePct: 1.5,
      grossAmountInr: 144e3,
      tdsDeductedInr: 7200,
      netPayableInr: 136800,
      status: "approved",
      approvedBy: "usr-fin-01",
      paidAt: null,
      createdAt: daysAgoIso(6)
    }
  ];
  const followUps = [
    {
      id: "fu-01",
      leadId: "lead-05",
      assignedTo: "usr-exec-01",
      channel: "call",
      dueAt: daysAheadIso(0, 16),
      notes: "Confirm floor-rise waiver approval for Tower B 1904 with Nikhil Sharma.",
      isAutomated: false,
      status: "pending",
      completedAt: null,
      createdAt: daysAgoIso(1)
    },
    {
      id: "fu-02",
      leadId: "lead-06",
      assignedTo: "usr-exec-02",
      channel: "whatsapp",
      dueAt: daysAheadIso(1, 10),
      notes: "Send Mokila site location pin & chauffeur details in Tamil.",
      isAutomated: true,
      status: "pending",
      completedAt: null,
      createdAt: daysAgoIso(1)
    },
    {
      id: "fu-03",
      leadId: "lead-08",
      assignedTo: "usr-exec-03",
      channel: "in_person",
      dueAt: daysAheadIso(1, 15),
      notes: "Walkthrough of Ground Retail GGN-R-003 with Gaurav Taneja.",
      isAutomated: false,
      status: "pending",
      completedAt: null,
      createdAt: daysAgoIso(2)
    },
    {
      id: "fu-04",
      leadId: "lead-09",
      assignedTo: "usr-exec-04",
      channel: "email",
      dueAt: daysAheadIso(0, 17),
      notes: "Share PMRDA NA sanction copy and payment schedule for Plot 142.",
      isAutomated: true,
      status: "pending",
      completedAt: null,
      createdAt: daysAgoIso(2)
    }
  ];
  const campaigns = [
    {
      id: "cmp-01",
      name: "Diwali Festive Zero Floor-Rise \u2014 Whitefield",
      channel: "whatsapp",
      targetTemperature: "hot",
      targetCity: "Bengaluru",
      projectId: "prj-01",
      templateMessage: "Namaste! Enjoy Zero Floor-Rise on 3 BHK Skyhomes at Avasa Skyline Residences, Whitefield. Reply VISIT to book a chauffeur-driven tour.",
      languageCode: "en",
      status: "completed",
      sentCount: 42,
      skippedOptOutCount: 3,
      createdBy: "usr-mgr-01",
      lastRunAt: daysAgoIso(5),
      createdAt: daysAgoIso(8)
    },
    {
      id: "cmp-02",
      name: "Ready-to-Move Villa Open House \u2014 Hyderabad",
      channel: "whatsapp",
      targetTemperature: "warm",
      targetCity: "Hyderabad",
      projectId: "prj-02",
      templateMessage: "Emerald Courtyard Villas (Mokila) OC received! Tour ready 4 BHK courtyard villas this weekend. Zero GST benefit.",
      languageCode: "en",
      status: "scheduled",
      sentCount: 0,
      skippedOptOutCount: 0,
      createdBy: "usr-mgr-01",
      lastRunAt: null,
      createdAt: daysAgoIso(1)
    }
  ];
  const auditLogs = [
    {
      id: 1,
      actorUserId: "usr-admin-01",
      actorName: "Vikramaditya Rao",
      actorRole: "admin",
      action: "SYSTEM_INITIALIZED",
      entityType: "system",
      entityId: null,
      details: { timezone: "Asia/Kolkata", currency: "INR", dpdpMode: "strict" },
      ipAddress: "127.0.0.1",
      createdAt: daysAgoIso(15)
    },
    {
      id: 2,
      actorUserId: "usr-exec-01",
      actorName: "Arjun Deshmukh",
      actorRole: "sales_exec",
      action: "BOOKING_CREATED",
      entityType: "bookings",
      entityId: "bk-01",
      details: { bookingCode: "BK-BLR-2026-01", amountInr: 19425e3 },
      ipAddress: "10.24.18.42",
      createdAt: daysAgoIso(15)
    },
    {
      id: 3,
      actorUserId: null,
      actorName: "WhatsApp Webhook",
      actorRole: "system",
      action: "CONSENT_WITHDRAWN",
      entityType: "consent",
      entityId: "con-04",
      details: { phone: "+91 97400 19823", keyword: "STOP", channel: "whatsapp" },
      ipAddress: "172.16.0.9",
      createdAt: daysAgoIso(18)
    }
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
    auditLogs
  };
}
var dbCache = null;
function getDb() {
  if (dbCache) return dbCache;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      dbCache = JSON.parse(raw);
      return dbCache;
    } catch {
    }
  }
  dbCache = buildSeedDatabase();
  saveDb();
  return dbCache;
}
function saveDb() {
  if (!dbCache) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(dbCache, null, 2), "utf8");
  fs.renameSync(tmpFile, DB_FILE);
}
function createDatabaseBackup(actorUserId, actorName, actorRole) {
  const db = getDb();
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const filename = `avasa_crm_backup_${stamp}.json`;
  const target = path.join(BACKUP_DIR, filename);
  const sanitizedSnapshot = {
    exportedAtIst: (/* @__PURE__ */ new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    timezone: "Asia/Kolkata",
    currency: "INR",
    ...db,
    users: db.users.map(({ passwordHash: _ph, ...u }) => u)
  };
  const json = JSON.stringify(sanitizedSnapshot, null, 2);
  fs.writeFileSync(target, json, "utf8");
  writeAuditLog({
    actorUserId,
    actorName,
    actorRole,
    action: "DATABASE_BACKUP_CREATED",
    entityType: "system",
    entityId: filename,
    details: { sizeBytes: Buffer.byteLength(json, "utf8") },
    ipAddress: "127.0.0.1"
  });
  return {
    filename,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    sizeBytes: Buffer.byteLength(json, "utf8"),
    recordCounts: {
      leads: db.leads.length,
      customers: db.customers.length,
      projects: db.projects.length,
      properties: db.properties.length,
      bookings: db.bookings.length,
      payments: db.payments.length,
      consent: db.consent.length,
      auditLogs: db.auditLogs.length
    }
  };
}
function writeAuditLog(entry) {
  const db = getDb();
  const nextId = db.auditLogs.length ? Math.max(...db.auditLogs.map((a) => a.id)) + 1 : 1;
  const record = {
    id: nextId,
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
    ipAddress: entry.ipAddress ?? "127.0.0.1",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.auditLogs.unshift(record);
  if (db.auditLogs.length > 500) {
    db.auditLogs.length = 500;
  }
  saveDb();
  return record;
}
function stripPassword(u) {
  const { passwordHash: _removed, ...safe } = u;
  return safe;
}
function canAccessLead(userId, roleCode, lead) {
  if (roleCode === "admin" || roleCode === "sales_manager") return true;
  if (roleCode === "finance") return lead.stage === "booked";
  return lead.assignedTo === userId;
}
function canAccessCustomer(userId, roleCode, customer) {
  if (roleCode === "admin" || roleCode === "sales_manager" || roleCode === "finance") return true;
  return customer.assignedTo === userId;
}
function isContactOptedOut(phone, leadId) {
  const db = getDb();
  const normalized = phone.replace(/\s+/g, "");
  return db.consent.some(
    (c) => (c.phone.replace(/\s+/g, "") === normalized || leadId && c.leadId === leadId) && (c.status === "opted_out" || c.status === "withdrawn")
  );
}
function newId(prefix) {
  return `${prefix}-${crypto2.randomBytes(4).toString("hex")}`;
}
function computeDashboardMetrics(filters) {
  const db = getDb();
  const todayIst = formatIstDate(/* @__PURE__ */ new Date());
  const effectiveEmployeeId = filters.roleCode === "sales_exec" ? filters.userId : filters.employeeId || void 0;
  const matchesDate = (iso) => {
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
    if (b.status === "cancelled") return false;
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
  const collectedRevenueInr = filteredPayments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amountInr, 0);
  const pendingPaymentsInr = filteredPayments.filter((p) => p.status === "pending" || p.status === "overdue").reduce((sum, p) => sum + p.amountInr, 0);
  const totalEnquiries = filteredLeads.length;
  const todaysEnquiries = filteredLeads.filter((l) => formatIstDate(new Date(l.createdAt)) === todayIst).length;
  const conversionRatePct = totalEnquiries > 0 ? Number((filteredBookings.length / totalEnquiries * 100).toFixed(1)) : 0;
  const salesStaff = db.users.filter((u) => u.roleCode === "sales_exec" || u.roleCode === "sales_manager");
  const employeePerformance = salesStaff.filter((u) => !effectiveEmployeeId || u.id === effectiveEmployeeId).map((u) => {
    const empLeads = filteredLeads.filter((l) => l.assignedTo === u.id).length;
    const empVisits = filteredVisits.filter((v) => v.assignedTo === u.id && v.status === "completed").length;
    const empBookings = filteredBookings.filter((b) => b.closedBy === u.id);
    const revenueInr = empBookings.reduce((s, b) => s + b.totalPayableInr, 0);
    const attainmentPct = u.monthlyTargetInr > 0 ? Number((revenueInr / u.monthlyTargetInr * 100).toFixed(1)) : 0;
    return {
      employeeId: u.id,
      name: u.fullName,
      city: u.city,
      leadsAssigned: empLeads,
      siteVisitsDone: empVisits,
      bookingsClosed: empBookings.length,
      revenueInr,
      targetInr: u.monthlyTargetInr,
      attainmentPct
    };
  }).sort((a, b) => b.revenueInr - a.revenueInr);
  const sourceMap = /* @__PURE__ */ new Map();
  for (const l of filteredLeads) {
    const cur = sourceMap.get(l.source) || { count: 0, bookings: 0 };
    cur.count += 1;
    if (l.stage === "booked") cur.bookings += 1;
    sourceMap.set(l.source, cur);
  }
  const leadSourceAnalytics = Array.from(sourceMap.entries()).map(([source, stats]) => ({
    source,
    count: stats.count,
    bookings: stats.bookings,
    conversionPct: stats.count > 0 ? Number((stats.bookings / stats.count * 100).toFixed(1)) : 0
  })).sort((a, b) => b.count - a.count);
  const monthNames = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
  const currentMonthIdx = monthNames.length - 1;
  const baselineMonthly = [
    { month: "Jun", bookings: 2, revenueInr: 315e5, enquiries: 14 },
    { month: "Jul", bookings: 3, revenueInr: 482e5, enquiries: 19 },
    { month: "Aug", bookings: 2, revenueInr: 294e5, enquiries: 17 },
    { month: "Sep", bookings: 4, revenueInr: 648e5, enquiries: 24 },
    { month: "Oct", bookings: 3, revenueInr: 521e5, enquiries: 21 },
    {
      month: "Nov",
      bookings: filteredBookings.length,
      revenueInr: totalRevenueInr,
      enquiries: filteredLeads.length
    }
  ];
  const monthlySalesGraph = effectiveEmployeeId || filters.projectId || filters.location ? baselineMonthly.map(
    (m, idx) => idx === currentMonthIdx ? m : {
      month: m.month,
      bookings: Math.max(0, Math.round(m.bookings * 0.35)),
      revenueInr: Math.round(m.revenueInr * 0.35),
      enquiries: Math.max(1, Math.round(m.enquiries * 0.35))
    }
  ) : baselineMonthly;
  const projectWiseSales = db.projects.filter((p) => !filters.projectId || p.id === filters.projectId).filter((p) => !filters.location || p.city.toLowerCase() === filters.location.toLowerCase()).map((p) => {
    const pBookings = filteredBookings.filter((b) => b.projectId === p.id);
    return {
      projectId: p.id,
      projectName: p.name,
      city: p.city,
      bookingsCount: pBookings.length,
      revenueInr: pBookings.reduce((s, b) => s + b.totalPayableInr, 0),
      availableUnits: p.availableUnits,
      totalUnits: p.totalUnits
    };
  });
  return {
    kpis: {
      totalEnquiries,
      todaysEnquiries,
      newLeads: filteredLeads.filter((l) => l.stage === "new").length,
      hotLeads: filteredLeads.filter((l) => l.temperature === "hot").length,
      warmLeads: filteredLeads.filter((l) => l.temperature === "warm").length,
      coldLeads: filteredLeads.filter((l) => l.temperature === "cold").length,
      followUpsPending: filteredFollowUps.filter((f) => f.status === "pending").length,
      siteVisitsScheduled: filteredVisits.filter((v) => v.status === "scheduled").length,
      siteVisitsCompleted: filteredVisits.filter((v) => v.status === "completed").length,
      bookingsConfirmed: filteredBookings.length,
      totalRevenueInr,
      collectedRevenueInr,
      pendingPaymentsInr,
      conversionRatePct
    },
    employeePerformance,
    leadSourceAnalytics,
    monthlySalesGraph,
    projectWiseSales
  };
}

// server/ai.ts
import { GoogleGenAI, Type } from "@google/genai";
function getAiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured in server environment secrets.");
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
async function generateRealEstateAiReply(params) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured in server environment secrets.");
  }
  const inventorySnapshot = params.properties.filter((p) => p.status === "available").slice(0, 12).map((p) => ({
    unitCode: p.unitCode,
    title: p.title,
    category: p.category,
    transactionType: p.transactionType,
    city: p.city,
    locality: p.locality,
    configuration: p.configuration,
    carpetAreaSqft: p.carpetAreaSqft,
    priceInr: p.priceInr,
    monthlyRentInr: p.monthlyRentInr
  }));
  const projectsSnapshot = params.projects.map((pr) => ({
    code: pr.code,
    name: pr.name,
    city: pr.city,
    microMarket: pr.microMarket,
    reraId: pr.reraId,
    type: pr.projectType,
    status: pr.status,
    priceRangeInr: [pr.basePriceMinInr, pr.basePriceMaxInr]
  }));
  const recentTranscript = params.history.slice(-6).map((m) => `${m.senderType === "customer" ? "Customer" : "Agent"}: ${m.body}`).join("\n");
  const systemInstruction = `You are Avasa Realty's senior multilingual WhatsApp Business & AI Property Advisor for the Indian real estate market (timezone Asia/Kolkata, currency INR \u20B9 in Lakhs/Crores).
Rules:
1. Detect the customer's language automatically (English 'en', Hindi 'hi', Hinglish 'hi-Latn', Tamil 'ta', Telugu 'te', Marathi 'mr', Kannada 'kn', or Gujarati 'gu') and reply fluently in the SAME language and script/style the customer used.
2. Only quote properties, prices (in INR Lakhs/Crores), and RERA IDs from the provided live inventory. Never invent fake units or prices.
3. Keep WhatsApp replies crisp, warm, and action-oriented (under 90 words), recommending 1-2 matching properties and offering to schedule a site visit.
4. If the user writes STOP, UNSUBSCRIBE, OPT OUT, or asks not to be contacted, set detectedIntent='opt_out' and reply politely confirming immediate opt-out.
5. Classify temperature accurately ('hot' if asking for visit/booking/price negotiation, 'warm' if exploring configurations/budget, 'cold' if browsing broadly or pausing).`;
  const prompt = `Customer Name: ${params.customerName}
Preferred Language Hint: ${params.preferredLanguage || "auto-detect"}
Live Projects: ${JSON.stringify(projectsSnapshot)}
Available Property Units: ${JSON.stringify(inventorySnapshot)}
Recent Conversation:
${recentTranscript || "(New conversation)"}

Latest Customer Message:
"${params.incomingMessage}"`;
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING, description: "WhatsApp reply in the customer language." },
          detectedLanguage: { type: Type.STRING, description: "ISO or Hinglish code: en, hi, hi-Latn, ta, te, mr, kn, gu." },
          detectedIntent: {
            type: Type.STRING,
            description: "One of: property_inquiry, site_visit_request, pricing_negotiation, opt_out, general_question"
          },
          suggestedTemperature: { type: Type.STRING, description: "One of: hot, warm, cold" },
          suggestedBudgetInr: { type: Type.NUMBER, nullable: true },
          suggestedCity: { type: Type.STRING, nullable: true },
          suggestedCategory: {
            type: Type.STRING,
            nullable: true,
            description: "One of: residential, commercial, plot_land, villa, apartment, or null"
          },
          bookSiteVisitSuggested: { type: Type.BOOLEAN }
        },
        required: [
          "reply",
          "detectedLanguage",
          "detectedIntent",
          "suggestedTemperature",
          "bookSiteVisitSuggested"
        ]
      }
    }
  });
  const rawText = (response.text ?? "{}").trim();
  const parsed = JSON.parse(rawText);
  return parsed;
}

// server/docs.ts
var CRM_DOCUMENTATION = [
  {
    slug: "deployment",
    title: "Production Deployment & Security Architecture",
    category: "DevOps & Security",
    content: `# Production Deployment Guide \u2014 Avasa Realty CRM

## 1. Infrastructure Stack
- **Web Frontend & API Server**: Node.js 22 LTS + Express + React 19 (Vite bundle) on port 3000 behind HTTPS/TLS 1.3 load balancer.
- **Database**: PostgreSQL 16 (Cloud SQL or self-managed) configured in \`Asia/Kolkata\` timezone.
- **Mobile Client**: Responsive Mobile Web + React Native (Expo SDK 52) consuming the same \`/api/*\` JWT endpoints.

## 2. Database Migration Sequence
1. Provision PostgreSQL 16 database \`avasa_realty_crm\`.
2. Execute \`database/001_schema.sql\` to create all 17 relational tables and foreign key constraints.
3. Execute \`database/002_rls_and_indexes.sql\` to enable Row-Level Security (RLS), performance indexes, DPDP consent withdrawal triggers, and retention purge functions.
4. Execute \`database/003_seed_data.sql\` for initial roles, permissions, projects, and sample inventory.

## 3. Security Controls
- **Encryption in Transit**: Enforce TLS 1.3 at reverse proxy/Cloud Run ingress; enable \`sslmode=verify-full\` on PostgreSQL connections outside Auth Proxy.
- **Secrets Management**: Store \`GEMINI_API_KEY\`, \`SESSION_SECRET\`, \`WHATSAPP_ACCESS_TOKEN\`, and \`SQL_PASSWORD\` in GCP Secret Manager or Vault. Never commit \`.env\`.
- **Password Hashing**: Node \`crypto.scryptSync\` with per-user 16-byte random salt and constant-time \`timingSafeEqual\`.
- **Row-Level Access**: Sales executives are isolated to records where \`assigned_to = auth.sub\` across leads, customers (PII), conversations, site visits, and commissions.
- **Automated Backups**: Schedule daily \`pg_dump --format=custom --compress=9\` to encrypted object storage with 35-day PITR and 8-year RERA financial archive.
- **Data Retention**: Cold/lost leads without bookings expire at 365 days via \`purge_expired_cold_leads()\`; bookings/payments retain for 8 years per Indian RERA & Income Tax Act.`
  },
  {
    slug: "admin-manual",
    title: "Admin Operations Manual",
    category: "Administration",
    content: `# Company Admin Manual

## 1. Daily Executive Workflow
1. **Review Executive Dashboard**: Filter by Date Range, Project, Sales Employee, or City (\`Bengaluru\`, \`Hyderabad\`, \`Gurugram\`, \`Pune\`, \`Mumbai\`). Monitor Today's Enquiries, Hot Leads, Pending Follow-ups, and Pending Payments.
2. **Assign Incoming Leads**: Open **Leads & Pipeline**, inspect AI-qualified summaries, and assign unassigned or high-value leads to city-matched sales executives.
3. **Inventory & RERA Governance**: Add new projects under **Projects & Properties** with verified RERA registration IDs and unit-level pricing in INR.
4. **Approve Commissions**: Under **Bookings & Finance**, verify UTR payment references before approving 5% TDS-adjusted (Section 194H) sales commissions.
5. **DPDP Consent & Opt-Outs**: Monitor **Customers & Consent** to verify opt-out requests (\`STOP\` keyword) are respected immediately.
6. **Backups & Audit Logs**: Export periodic JSON/SQL backups in **SQL, Backups & Docs** and review \`PII_ACCESS_DENIED\` or \`CONSENT_WITHDRAWN\` entries in **Team & Security**.`
  },
  {
    slug: "employee-guide",
    title: "Sales Employee Training Guide",
    category: "Sales Operations",
    content: `# Sales Executive Field & CRM Guide

## 1. Managing Your Pipeline
- Your login automatically isolates your view to **your assigned leads and customers** to protect client privacy across teams.
- Prioritize **Hot** leads first and complete due **Follow-ups** before 6:00 PM IST.

## 2. Using WhatsApp Business & AI Assistant
- Open **WhatsApp & AI** to review incoming customer messages in English, Hindi, Hinglish, Tamil, Telugu, Marathi, Kannada, or Gujarati.
- Click **Generate AI Reply** to draft an inventory-accurate response in the customer's exact language, or type a personal agent reply.
- If a customer replies \`STOP\` or withdraws consent, automated messaging locks immediately\u2014do not contact them via promotional channels.

## 3. Site Visits to Booking Conversion
1. Schedule a site visit with pickup preference under **Site Visits & Follow-ups**.
2. Mark the visit **Completed** with buyer rating (1\u20135) and notes.
3. Once the buyer agrees, convert the lead to a **Booking**, upload token UTR, and track milestone collections.`
  },
  {
    slug: "api-docs",
    title: "REST API Reference",
    category: "Developer Docs",
    content: `# Avasa Realty CRM \u2014 REST API Documentation

All protected endpoints require header: \`Authorization: Bearer <jwt_token>\`

## Authentication
- \`POST /api/auth/login\` \u2014 Authenticate with email & password, returns JWT + user profile + permissions.
- \`GET /api/auth/me\` \u2014 Return current authenticated user profile.

## Dashboard & Analytics
- \`GET /api/dashboard?startDate=&endDate=&projectId=&employeeId=&location=\` \u2014 Returns all 17 KPIs, employee leaderboard, source analytics, monthly sales graph, and project-wise sales (row-level scoped for \`sales_exec\`).

## Leads & Customers
- \`GET /api/leads\` | \`POST /api/leads\` | \`PATCH /api/leads/:id\`
- \`POST /api/leads/:id/assign\` \u2014 Requires \`admin\` or \`sales_manager\`.
- \`GET /api/customers\` | \`GET /api/customers/:id\` | \`POST /api/customers\` \u2014 Enforces row-level PII protection (\`403\` logged on unauthorized access).

## Projects & Properties
- \`GET /api/projects\` | \`POST /api/projects\`
- \`GET /api/properties\` | \`POST /api/properties\` | \`PATCH /api/properties/:id\`

## WhatsApp Business & Gemini AI
- \`GET /api/whatsapp/conversations\`
- \`POST /api/whatsapp/incoming\` \u2014 Webhook/simulator for incoming customer messages (handles automatic \`STOP\` opt-out).
- \`POST /api/whatsapp/outgoing\` \u2014 Sends agent reply (blocked with \`403\` if contact opted out).
- \`POST /api/ai/reply\` \u2014 Calls Gemini (\`gemini-4-hydrogen\`) grounded in live property inventory with Indian language detection.

## Site Visits, Follow-ups, Bookings, Payments & Commissions
- \`GET/POST/PATCH /api/site-visits\`
- \`GET/POST/PATCH /api/follow-ups\`
- \`GET/POST/PATCH /api/bookings\` \u2014 Locks property unit, creates payment milestones & commission calculation.
- \`GET/POST/PATCH /api/payments\`
- \`GET/PATCH /api/commissions\`

## Consent, Campaigns, Security & Backups
- \`GET/POST/PATCH /api/consent\` \u2014 Grant, withdraw, or opt out.
- \`GET/POST /api/campaigns\` & \`POST /api/campaigns/:id/run\` \u2014 Skips opted-out contacts automatically.
- \`GET /api/audit-logs\` \u2014 Admin security trail.
- \`GET /api/database/sql/:file\` & \`POST /api/database/backup\``
  },
  {
    slug: "mobile-architecture",
    title: "Mobile Application Architecture (React Native / Expo)",
    category: "Mobile Engineering",
    content: `# Mobile Application Guide (iOS & Android Field Sales App)

The web CRM is fully responsive for tablet and mobile viewports (with 44px touch targets and slide-over navigation). For dedicated native field-sales apps (5\u201315 executives):

1. **Framework**: React Native with Expo Router (TypeScript) sharing \`src/types.ts\` contracts.
2. **Offline-First Site Visits**: Store assigned site visits & property brochures locally with \`expo-sqlite\` and sync check-ins via \`PATCH /api/site-visits/:id\`.
3. **Push Notifications**: Firebase Cloud Messaging (FCM) alerts for instant Hot Lead assignments and WhatsApp AI handoffs.
4. **Click-to-Call & Location Check-In**: Native \`Linking.openURL('tel:...')\` and GPS verification on site visit completion.`
  }
];

// server.ts
dotenv.config();
function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timezone: "Asia/Kolkata",
      currency: "INR",
      istTime: (/* @__PURE__ */ new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    });
  });
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
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
        action: "LOGIN_FAILED",
        entityType: "auth",
        details: { email },
        ipAddress: req.ip || "127.0.0.1"
      });
      return res.status(401).json({ error: "Invalid email or password." });
    }
    user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
    saveDb();
    const token = signJwt({
      sub: user.id,
      email: user.email,
      roleCode: user.roleCode,
      fullName: user.fullName
    });
    writeAuditLog({
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.roleCode,
      action: "LOGIN_SUCCESS",
      entityType: "auth",
      entityId: user.id,
      ipAddress: req.ip || "127.0.0.1"
    });
    res.json({
      token,
      user: stripPassword(user),
      permissions: db.rolePermissions[user.roleCode] || []
    });
  });
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.auth.sub);
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({
      user: stripPassword(user),
      permissions: db.rolePermissions[user.roleCode] || []
    });
  });
  app.get("/api/dashboard", requireAuth, (req, res) => {
    const { startDate, endDate, projectId, employeeId, location } = req.query;
    const metrics = computeDashboardMetrics({
      userId: req.auth.sub,
      roleCode: req.auth.roleCode,
      startDate: startDate || void 0,
      endDate: endDate || void 0,
      projectId: projectId || void 0,
      employeeId: employeeId || void 0,
      location: location || void 0
    });
    res.json(metrics);
  });
  app.get("/api/leads", requireAuth, (req, res) => {
    const db = getDb();
    const { temperature, stage, source, projectId, location, q } = req.query;
    const visible = db.leads.filter((l) => {
      if (!canAccessLead(req.auth.sub, req.auth.roleCode, l)) return false;
      if (temperature && l.temperature !== temperature) return false;
      if (stage && l.stage !== stage) return false;
      if (source && l.source !== source) return false;
      if (projectId && l.projectId !== projectId) return false;
      if (location && l.preferredCity.toLowerCase() !== location.toLowerCase()) return false;
      if (q) {
        const needle = q.toLowerCase();
        const match = l.fullName.toLowerCase().includes(needle) || l.leadCode.toLowerCase().includes(needle) || l.phone.includes(needle) || (l.preferredLocality || "").toLowerCase().includes(needle);
        if (!match) return false;
      }
      return true;
    });
    res.json(visible);
  });
  app.post("/api/leads", requireAuth, (req, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.fullName || !b.phone || !b.preferredCity) {
      return res.status(400).json({ error: "fullName, phone, and preferredCity are required." });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const assignedTo = req.auth.roleCode === "sales_exec" ? req.auth.sub : b.assignedTo || req.auth.sub;
    const lead = {
      id: newId("lead"),
      leadCode: `AVS-2026-${114 + db.leads.length}`,
      fullName: String(b.fullName).trim(),
      phone: String(b.phone).trim(),
      email: b.email ? String(b.email).trim() : null,
      preferredLanguage: b.preferredLanguage || "en",
      source: b.source || "website",
      temperature: b.temperature || "warm",
      stage: b.stage || "new",
      interestedCategory: b.interestedCategory || "apartment",
      transactionIntent: b.transactionIntent || "primary_sale",
      preferredCity: String(b.preferredCity).trim(),
      preferredLocality: b.preferredLocality ? String(b.preferredLocality).trim() : null,
      budgetMinInr: Number(b.budgetMinInr) || 1e7,
      budgetMaxInr: Number(b.budgetMaxInr) || 2e7,
      projectId: b.projectId || null,
      assignedTo,
      aiSummary: b.aiSummary || "Created in CRM pipeline.",
      lastContactedAt: null,
      retentionExpiresAt: new Date(Date.now() + 365 * 864e5).toISOString(),
      createdAt: now,
      updatedAt: now
    };
    db.leads.unshift(lead);
    if (b.consentGranted !== false) {
      db.consent.unshift({
        id: newId("con"),
        leadId: lead.id,
        customerId: null,
        contactName: lead.fullName,
        phone: lead.phone,
        channel: "whatsapp",
        purpose: "sales_followup",
        status: "granted",
        sourceProof: `CRM Lead Capture (${lead.source})`,
        grantedAt: now,
        withdrawnAt: null,
        updatedAt: now
      });
    }
    db.followUps.unshift({
      id: newId("fu"),
      leadId: lead.id,
      assignedTo: assignedTo || req.auth.sub,
      channel: "whatsapp",
      dueAt: new Date(Date.now() + 2 * 36e5).toISOString(),
      notes: `Automated first-touch follow-up for ${lead.fullName} (${lead.interestedCategory}).`,
      isAutomated: true,
      status: "pending",
      completedAt: null,
      createdAt: now
    });
    saveDb();
    writeAuditLog({
      actorUserId: req.auth.sub,
      actorName: req.auth.fullName,
      actorRole: req.auth.roleCode,
      action: "LEAD_CREATED",
      entityType: "leads",
      entityId: lead.id,
      details: { leadCode: lead.leadCode, source: lead.source },
      ipAddress: req.ip || "127.0.0.1"
    });
    res.status(201).json(lead);
  });
  app.patch("/api/leads/:id", requireAuth, (req, res) => {
    const db = getDb();
    const lead = db.leads.find((l) => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    if (!canAccessLead(req.auth.sub, req.auth.roleCode, lead)) {
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "LEAD_ACCESS_DENIED",
        entityType: "leads",
        entityId: lead.id,
        ipAddress: req.ip || "127.0.0.1"
      });
      return res.status(403).json({ error: "Forbidden: You cannot modify an unassigned lead." });
    }
    const body = req.body ?? {};
    if (body.temperature !== void 0) lead.temperature = body.temperature;
    if (body.stage !== void 0) lead.stage = body.stage;
    if (body.preferredLanguage !== void 0) lead.preferredLanguage = body.preferredLanguage;
    if (body.interestedCategory !== void 0) lead.interestedCategory = body.interestedCategory;
    if (body.transactionIntent !== void 0) lead.transactionIntent = body.transactionIntent;
    if (body.preferredCity !== void 0) lead.preferredCity = body.preferredCity;
    if (body.preferredLocality !== void 0) lead.preferredLocality = body.preferredLocality;
    if (body.budgetMinInr !== void 0) lead.budgetMinInr = Number(body.budgetMinInr);
    if (body.budgetMaxInr !== void 0) lead.budgetMaxInr = Number(body.budgetMaxInr);
    if (body.projectId !== void 0) lead.projectId = body.projectId;
    if (body.aiSummary !== void 0) lead.aiSummary = body.aiSummary;
    lead.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    saveDb();
    res.json(lead);
  });
  app.post(
    "/api/leads/:id/assign",
    requireAuth,
    requireRoles("admin", "sales_manager"),
    (req, res) => {
      const db = getDb();
      const lead = db.leads.find((l) => l.id === req.params.id);
      if (!lead) return res.status(404).json({ error: "Lead not found." });
      const { assignedTo } = req.body ?? {};
      const employee = db.users.find((u) => u.id === assignedTo && u.isActive);
      if (!employee) return res.status(400).json({ error: "Valid active employee required." });
      lead.assignedTo = employee.id;
      lead.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      for (const conv of db.conversations) {
        if (conv.leadId === lead.id) conv.assignedTo = employee.id;
      }
      for (const fu of db.followUps) {
        if (fu.leadId === lead.id && fu.status === "pending") fu.assignedTo = employee.id;
      }
      for (const sv of db.siteVisits) {
        if (sv.leadId === lead.id && sv.status === "scheduled") sv.assignedTo = employee.id;
      }
      saveDb();
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "LEAD_ASSIGNED",
        entityType: "leads",
        entityId: lead.id,
        details: { assignedTo: employee.id, employeeName: employee.fullName },
        ipAddress: req.ip || "127.0.0.1"
      });
      res.json(lead);
    }
  );
  app.get("/api/projects", requireAuth, (req, res) => {
    const db = getDb();
    const { city, type } = req.query;
    const list = db.projects.filter((p) => {
      if (city && p.city.toLowerCase() !== city.toLowerCase()) return false;
      if (type && p.projectType !== type) return false;
      return true;
    });
    res.json(list);
  });
  app.post(
    "/api/projects",
    requireAuth,
    requireRoles("admin", "sales_manager"),
    (req, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.name || !b.reraId || !b.city) {
        return res.status(400).json({ error: "name, reraId, and city are required." });
      }
      const project = {
        id: newId("prj"),
        code: b.code || `PRJ-${String(b.city).slice(0, 3).toUpperCase()}-${db.projects.length + 1}`,
        name: String(b.name),
        developerName: b.developerName || "Avasa Urban Developers Pvt Ltd",
        reraId: String(b.reraId),
        projectType: b.projectType || "residential",
        city: String(b.city),
        microMarket: b.microMarket || "Central Corridor",
        address: b.address || `${b.city}, India`,
        totalUnits: Number(b.totalUnits) || 50,
        availableUnits: Number(b.availableUnits ?? b.totalUnits) || 50,
        basePriceMinInr: Number(b.basePriceMinInr) || 1e7,
        basePriceMaxInr: Number(b.basePriceMaxInr) || 25e6,
        possessionDate: b.possessionDate || "2027-12-31",
        status: b.status || "under_construction",
        imageUrl: b.imageUrl || "/src/assets/images/project_skyline_residences_1794906610259.jpg",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.projects.unshift(project);
      saveDb();
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "PROJECT_CREATED",
        entityType: "projects",
        entityId: project.id,
        details: { code: project.code, reraId: project.reraId },
        ipAddress: req.ip || "127.0.0.1"
      });
      res.status(201).json(project);
    }
  );
  app.get("/api/properties", requireAuth, (req, res) => {
    const db = getDb();
    const { category, transactionType, status, city, projectId } = req.query;
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
    "/api/properties",
    requireAuth,
    requireRoles("admin", "sales_manager"),
    (req, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.title || !b.category || !b.city || !b.priceInr) {
        return res.status(400).json({ error: "title, category, city, and priceInr are required." });
      }
      const prop = {
        id: newId("prop"),
        projectId: b.projectId || null,
        unitCode: b.unitCode || `UNIT-${db.properties.length + 101}`,
        title: String(b.title),
        category: b.category,
        transactionType: b.transactionType || "primary_sale",
        city: String(b.city),
        locality: b.locality || "Prime Sector",
        configuration: b.configuration || "3 BHK",
        carpetAreaSqft: Number(b.carpetAreaSqft) || 1400,
        superBuiltupSqft: Number(b.superBuiltupSqft) || 1800,
        facing: b.facing || "East",
        floorNumber: b.floorNumber !== void 0 ? Number(b.floorNumber) : 1,
        priceInr: Number(b.priceInr),
        monthlyRentInr: b.monthlyRentInr ? Number(b.monthlyRentInr) : null,
        securityDepositInr: b.securityDepositInr ? Number(b.securityDepositInr) : null,
        furnishing: b.furnishing || "unfurnished",
        status: b.status || "available",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.properties.unshift(prop);
      saveDb();
      res.status(201).json(prop);
    }
  );
  app.patch(
    "/api/properties/:id",
    requireAuth,
    requireRoles("admin", "sales_manager"),
    (req, res) => {
      const db = getDb();
      const prop = db.properties.find((p) => p.id === req.params.id);
      if (!prop) return res.status(404).json({ error: "Property not found." });
      if (req.body.status) prop.status = req.body.status;
      if (req.body.priceInr) prop.priceInr = Number(req.body.priceInr);
      saveDb();
      res.json(prop);
    }
  );
  app.get("/api/customers", requireAuth, (req, res) => {
    const db = getDb();
    const visible = db.customers.filter(
      (c) => canAccessCustomer(req.auth.sub, req.auth.roleCode, c)
    );
    res.json(visible);
  });
  app.get("/api/customers/:id", requireAuth, (req, res) => {
    const db = getDb();
    const cust = db.customers.find((c) => c.id === req.params.id);
    if (!cust) return res.status(404).json({ error: "Customer not found." });
    if (!canAccessCustomer(req.auth.sub, req.auth.roleCode, cust)) {
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "PII_ACCESS_DENIED",
        entityType: "customers",
        entityId: cust.id,
        details: { attemptedCustomerName: cust.fullName },
        ipAddress: req.ip || "127.0.0.1"
      });
      return res.status(403).json({
        error: "Forbidden: Customer PII is restricted to the assigned sales executive or admin/finance."
      });
    }
    res.json(cust);
  });
  app.post("/api/customers", requireAuth, (req, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.fullName || !b.phone || !b.email) {
      return res.status(400).json({ error: "fullName, phone, and email are required." });
    }
    const cust = {
      id: newId("cust"),
      leadId: b.leadId || null,
      assignedTo: b.assignedTo || req.auth.sub,
      fullName: String(b.fullName),
      phone: String(b.phone),
      email: String(b.email),
      panMasked: b.panMasked || "XXXXX****X",
      city: b.city || "Bengaluru",
      correspondenceAddress: b.correspondenceAddress || "India",
      kycVerified: Boolean(b.kycVerified),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.customers.unshift(cust);
    saveDb();
    res.status(201).json(cust);
  });
  app.get("/api/consent", requireAuth, (req, res) => {
    const db = getDb();
    if (req.auth.roleCode === "sales_exec") {
      const myLeadIds = new Set(
        db.leads.filter((l) => l.assignedTo === req.auth.sub).map((l) => l.id)
      );
      return res.json(db.consent.filter((c) => c.leadId && myLeadIds.has(c.leadId)));
    }
    res.json(db.consent);
  });
  app.post("/api/consent", requireAuth, (req, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.phone || !b.contactName || !b.channel || !b.purpose) {
      return res.status(400).json({ error: "contactName, phone, channel, and purpose are required." });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const rec = {
      id: newId("con"),
      leadId: b.leadId || null,
      customerId: b.customerId || null,
      contactName: String(b.contactName),
      phone: String(b.phone),
      channel: b.channel,
      purpose: b.purpose,
      status: b.status || "granted",
      sourceProof: b.sourceProof || "Manual CRM Verification",
      grantedAt: b.status === "opted_out" || b.status === "withdrawn" ? null : now,
      withdrawnAt: b.status === "opted_out" || b.status === "withdrawn" ? now : null,
      updatedAt: now
    };
    db.consent.unshift(rec);
    saveDb();
    res.status(201).json(rec);
  });
  app.patch("/api/consent/:id", requireAuth, (req, res) => {
    const db = getDb();
    const rec = db.consent.find((c) => c.id === req.params.id);
    if (!rec) return res.status(404).json({ error: "Consent record not found." });
    const { status } = req.body ?? {};
    if (!["granted", "withdrawn", "opted_out"].includes(status)) {
      return res.status(400).json({ error: "Invalid consent status." });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    rec.status = status;
    rec.updatedAt = now;
    if (status === "withdrawn" || status === "opted_out") {
      rec.withdrawnAt = now;
      for (const conv of db.conversations) {
        if (conv.waPhone.replace(/\s+/g, "") === rec.phone.replace(/\s+/g, "") || rec.leadId && conv.leadId === rec.leadId) {
          conv.aiEnabled = false;
          conv.status = "opted_out";
        }
      }
      if (rec.leadId) {
        for (const fu of db.followUps) {
          if (fu.leadId === rec.leadId && fu.isAutomated && fu.status === "pending") {
            fu.status = "cancelled";
          }
        }
      }
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "CONSENT_WITHDRAWN",
        entityType: "consent",
        entityId: rec.id,
        details: { phone: rec.phone, status },
        ipAddress: req.ip || "127.0.0.1"
      });
    } else {
      rec.grantedAt = now;
      rec.withdrawnAt = null;
      for (const conv of db.conversations) {
        if (conv.waPhone.replace(/\s+/g, "") === rec.phone.replace(/\s+/g, "") || rec.leadId && conv.leadId === rec.leadId) {
          conv.status = "open";
          conv.aiEnabled = true;
        }
      }
    }
    saveDb();
    res.json(rec);
  });
  app.get("/api/whatsapp/conversations", requireAuth, (req, res) => {
    const db = getDb();
    const list = db.conversations.filter((c) => {
      if (req.auth.roleCode === "sales_exec") return c.assignedTo === req.auth.sub;
      return true;
    }).map((c) => {
      const lead = db.leads.find((l) => l.id === c.leadId);
      const msgs = db.messages.filter((m) => m.conversationId === c.id);
      return {
        ...c,
        leadName: lead?.fullName || "Prospect",
        leadCode: lead?.leadCode || "",
        temperature: lead?.temperature || "warm",
        optedOut: isContactOptedOut(c.waPhone, c.leadId),
        messages: msgs
      };
    }).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    res.json(list);
  });
  app.post("/api/whatsapp/incoming", requireAuth, async (req, res) => {
    try {
      const db = getDb();
      const { leadId, phone, senderName, text, triggerAi = true } = req.body ?? {};
      if (!text || !leadId && !phone) {
        return res.status(400).json({ error: "text and either leadId or phone are required." });
      }
      let lead = leadId ? db.leads.find((l) => l.id === leadId) : void 0;
      if (!lead && phone) {
        const norm = String(phone).replace(/\s+/g, "");
        lead = db.leads.find((l) => l.phone.replace(/\s+/g, "") === norm);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (!lead) {
        lead = {
          id: newId("lead"),
          leadCode: `AVS-2026-${114 + db.leads.length}`,
          fullName: senderName || "WhatsApp Prospect",
          phone: String(phone),
          email: null,
          preferredLanguage: "en",
          source: "whatsapp",
          temperature: "warm",
          stage: "new",
          interestedCategory: "apartment",
          transactionIntent: "primary_sale",
          preferredCity: "Bengaluru",
          preferredLocality: null,
          budgetMinInr: 1e7,
          budgetMaxInr: 25e6,
          projectId: null,
          assignedTo: req.auth.sub,
          aiSummary: "Auto-created from WhatsApp Business incoming message.",
          lastContactedAt: now,
          retentionExpiresAt: new Date(Date.now() + 365 * 864e5).toISOString(),
          createdAt: now,
          updatedAt: now
        };
        db.leads.unshift(lead);
        db.consent.unshift({
          id: newId("con"),
          leadId: lead.id,
          customerId: null,
          contactName: lead.fullName,
          phone: lead.phone,
          channel: "whatsapp",
          purpose: "ai_chatbot",
          status: "granted",
          sourceProof: "WhatsApp Inbound Conversation Initiation",
          grantedAt: now,
          withdrawnAt: null,
          updatedAt: now
        });
      }
      let conv = db.conversations.find((c) => c.leadId === lead.id);
      if (!conv) {
        conv = {
          id: newId("conv"),
          leadId: lead.id,
          assignedTo: lead.assignedTo,
          channel: "whatsapp",
          waPhone: lead.phone,
          detectedLanguage: lead.preferredLanguage || "en",
          aiEnabled: true,
          status: "open",
          lastMessageAt: now,
          createdAt: now
        };
        db.conversations.unshift(conv);
      }
      const incomingText = String(text).trim();
      const inboundMsg = {
        id: newId("msg"),
        conversationId: conv.id,
        direction: "inbound",
        senderType: "customer",
        senderUserId: null,
        body: incomingText,
        languageCode: conv.detectedLanguage,
        waMessageId: `wamid.IN.${Date.now()}`,
        deliveryStatus: "read",
        createdAt: now
      };
      db.messages.push(inboundMsg);
      conv.lastMessageAt = now;
      lead.lastContactedAt = now;
      const isOptOutKeyword = /^(stop|unsubscribe|opt\s*out|cancel)$/i.test(incomingText);
      if (isOptOutKeyword) {
        conv.aiEnabled = false;
        conv.status = "opted_out";
        for (const c of db.consent) {
          if (c.leadId === lead.id || c.phone.replace(/\s+/g, "") === lead.phone.replace(/\s+/g, "")) {
            c.status = "opted_out";
            c.withdrawnAt = now;
            c.updatedAt = now;
          }
        }
        const ackMsg = {
          id: newId("msg"),
          conversationId: conv.id,
          direction: "outbound",
          senderType: "ai_bot",
          senderUserId: null,
          body: "You have been opted out from Avasa Realty WhatsApp updates immediately per DPDP preferences.",
          languageCode: "en",
          waMessageId: `wamid.OPTOUT.${Date.now()}`,
          deliveryStatus: "delivered",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        db.messages.push(ackMsg);
        saveDb();
        writeAuditLog({
          actorUserId: req.auth.sub,
          actorName: lead.fullName,
          actorRole: "customer",
          action: "CONSENT_WITHDRAWN",
          entityType: "consent",
          entityId: lead.id,
          details: { keyword: incomingText, phone: lead.phone }
        });
        return res.status(201).json({ conversation: conv, inboundMsg, aiReplyMsg: ackMsg, optedOut: true });
      }
      let aiReplyMsg = null;
      let aiAnalysis = null;
      if (triggerAi && conv.aiEnabled && !isContactOptedOut(lead.phone, lead.id)) {
        const history = db.messages.filter((m) => m.conversationId === conv.id);
        aiAnalysis = await generateRealEstateAiReply({
          customerName: lead.fullName,
          incomingMessage: incomingText,
          history,
          projects: db.projects,
          properties: db.properties,
          preferredLanguage: lead.preferredLanguage
        });
        conv.detectedLanguage = aiAnalysis.detectedLanguage || conv.detectedLanguage;
        lead.preferredLanguage = aiAnalysis.detectedLanguage || lead.preferredLanguage;
        lead.temperature = aiAnalysis.suggestedTemperature || lead.temperature;
        if (aiAnalysis.suggestedCity) lead.preferredCity = aiAnalysis.suggestedCity;
        if (aiAnalysis.suggestedCategory) lead.interestedCategory = aiAnalysis.suggestedCategory;
        if (aiAnalysis.suggestedBudgetInr) lead.budgetMaxInr = aiAnalysis.suggestedBudgetInr;
        lead.aiSummary = `AI (${aiAnalysis.detectedLanguage}): Intent ${aiAnalysis.detectedIntent}. ${lead.aiSummary || ""}`.slice(0, 260);
        lead.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        aiReplyMsg = {
          id: newId("msg"),
          conversationId: conv.id,
          direction: "outbound",
          senderType: "ai_bot",
          senderUserId: null,
          body: aiAnalysis.reply,
          languageCode: aiAnalysis.detectedLanguage || "en",
          waMessageId: `wamid.AI.${Date.now()}`,
          deliveryStatus: "delivered",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        db.messages.push(aiReplyMsg);
        conv.lastMessageAt = aiReplyMsg.createdAt;
      }
      saveDb();
      res.status(201).json({ conversation: conv, inboundMsg, aiReplyMsg, aiAnalysis, optedOut: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI generation failed.";
      res.status(502).json({ error: message });
    }
  });
  app.post("/api/whatsapp/outgoing", requireAuth, (req, res) => {
    const db = getDb();
    const { conversationId, body } = req.body ?? {};
    if (!conversationId || !body) {
      return res.status(400).json({ error: "conversationId and body are required." });
    }
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv) return res.status(404).json({ error: "Conversation not found." });
    if (req.auth.roleCode === "sales_exec" && conv.assignedTo !== req.auth.sub) {
      return res.status(403).json({ error: "Forbidden: Conversation belongs to another sales executive." });
    }
    if (isContactOptedOut(conv.waPhone, conv.leadId) || conv.status === "opted_out") {
      return res.status(403).json({
        error: "Blocked: Contact has withdrawn consent or opted out of WhatsApp communications."
      });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const msg = {
      id: newId("msg"),
      conversationId: conv.id,
      direction: "outbound",
      senderType: "employee",
      senderUserId: req.auth.sub,
      body: String(body).trim(),
      languageCode: conv.detectedLanguage || "en",
      waMessageId: `wamid.EMP.${Date.now()}`,
      deliveryStatus: "delivered",
      createdAt: now
    };
    db.messages.push(msg);
    conv.lastMessageAt = now;
    saveDb();
    res.status(201).json(msg);
  });
  app.post("/api/ai/reply", requireAuth, async (req, res) => {
    try {
      const db = getDb();
      const { conversationId, promptOverride } = req.body ?? {};
      const conv = db.conversations.find((c) => c.id === conversationId);
      if (!conv) return res.status(404).json({ error: "Conversation not found." });
      const lead = db.leads.find((l) => l.id === conv.leadId);
      if (!lead) return res.status(404).json({ error: "Lead not found." });
      if (isContactOptedOut(conv.waPhone, conv.leadId)) {
        return res.status(403).json({ error: "Blocked: Contact has opted out of AI/WhatsApp replies." });
      }
      const history = db.messages.filter((m) => m.conversationId === conv.id);
      const lastInbound = [...history].reverse().find((m) => m.direction === "inbound");
      const queryText = promptOverride || lastInbound?.body || "Please share available property options.";
      const analysis = await generateRealEstateAiReply({
        customerName: lead.fullName,
        incomingMessage: queryText,
        history,
        projects: db.projects,
        properties: db.properties,
        preferredLanguage: lead.preferredLanguage
      });
      const msg = {
        id: newId("msg"),
        conversationId: conv.id,
        direction: "outbound",
        senderType: "ai_bot",
        senderUserId: null,
        body: analysis.reply,
        languageCode: analysis.detectedLanguage || "en",
        waMessageId: `wamid.AI.${Date.now()}`,
        deliveryStatus: "delivered",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.messages.push(msg);
      conv.lastMessageAt = msg.createdAt;
      conv.detectedLanguage = analysis.detectedLanguage || conv.detectedLanguage;
      saveDb();
      res.status(201).json({ message: msg, analysis });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI Assistant error.";
      res.status(502).json({ error: message });
    }
  });
  app.get("/api/site-visits", requireAuth, (req, res) => {
    const db = getDb();
    const list = db.siteVisits.filter(
      (v) => req.auth.roleCode === "sales_exec" ? v.assignedTo === req.auth.sub : true
    );
    res.json(list);
  });
  app.post("/api/site-visits", requireAuth, (req, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.leadId || !b.projectId || !b.scheduledAt) {
      return res.status(400).json({ error: "leadId, projectId, and scheduledAt are required." });
    }
    const lead = db.leads.find((l) => l.id === b.leadId);
    if (!lead) return res.status(404).json({ error: "Lead not found." });
    const visit = {
      id: newId("sv"),
      leadId: b.leadId,
      projectId: b.projectId,
      propertyId: b.propertyId || null,
      assignedTo: b.assignedTo || lead.assignedTo || req.auth.sub,
      scheduledAt: b.scheduledAt,
      completedAt: null,
      status: "scheduled",
      pickupRequired: Boolean(b.pickupRequired),
      feedback: null,
      rating: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.siteVisits.unshift(visit);
    if (lead.stage === "new" || lead.stage === "contacted" || lead.stage === "qualified") {
      lead.stage = "site_visit_scheduled";
    }
    saveDb();
    res.status(201).json(visit);
  });
  app.patch("/api/site-visits/:id", requireAuth, (req, res) => {
    const db = getDb();
    const visit = db.siteVisits.find((v) => v.id === req.params.id);
    if (!visit) return res.status(404).json({ error: "Site visit not found." });
    if (req.auth.roleCode === "sales_exec" && visit.assignedTo !== req.auth.sub) {
      return res.status(403).json({ error: "Forbidden." });
    }
    if (req.body.status) {
      visit.status = req.body.status;
      if (req.body.status === "completed") {
        visit.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        const lead = db.leads.find((l) => l.id === visit.leadId);
        if (lead && lead.stage !== "booked") lead.stage = "site_visit_done";
      }
    }
    if (req.body.feedback !== void 0) visit.feedback = req.body.feedback;
    if (req.body.rating !== void 0) visit.rating = Number(req.body.rating);
    saveDb();
    res.json(visit);
  });
  app.get("/api/follow-ups", requireAuth, (req, res) => {
    const db = getDb();
    const list = db.followUps.filter(
      (f) => req.auth.roleCode === "sales_exec" ? f.assignedTo === req.auth.sub : true
    );
    res.json(list);
  });
  app.post("/api/follow-ups", requireAuth, (req, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.leadId || !b.dueAt || !b.notes) {
      return res.status(400).json({ error: "leadId, dueAt, and notes are required." });
    }
    const fu = {
      id: newId("fu"),
      leadId: b.leadId,
      assignedTo: b.assignedTo || req.auth.sub,
      channel: b.channel || "call",
      dueAt: b.dueAt,
      notes: String(b.notes),
      isAutomated: Boolean(b.isAutomated),
      status: "pending",
      completedAt: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.followUps.unshift(fu);
    saveDb();
    res.status(201).json(fu);
  });
  app.patch("/api/follow-ups/:id", requireAuth, (req, res) => {
    const db = getDb();
    const fu = db.followUps.find((f) => f.id === req.params.id);
    if (!fu) return res.status(404).json({ error: "Follow-up not found." });
    if (req.body.status) {
      fu.status = req.body.status;
      if (req.body.status === "completed") fu.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    saveDb();
    res.json(fu);
  });
  app.get("/api/bookings", requireAuth, (req, res) => {
    const db = getDb();
    const list = db.bookings.filter(
      (b) => req.auth.roleCode === "sales_exec" ? b.closedBy === req.auth.sub : true
    );
    res.json(list);
  });
  app.post("/api/bookings", requireAuth, (req, res) => {
    const db = getDb();
    const b = req.body ?? {};
    if (!b.leadId || !b.propertyId || !b.agreementValueInr) {
      return res.status(400).json({ error: "leadId, propertyId, and agreementValueInr are required." });
    }
    const lead = db.leads.find((l) => l.id === b.leadId);
    const prop = db.properties.find((p) => p.id === b.propertyId);
    if (!lead || !prop) return res.status(404).json({ error: "Lead or property not found." });
    if (prop.status !== "available" && prop.status !== "reserved") {
      return res.status(400).json({ error: `Property ${prop.unitCode} is already ${prop.status}.` });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let customer = db.customers.find((c) => c.leadId === lead.id);
    if (!customer) {
      customer = {
        id: newId("cust"),
        leadId: lead.id,
        assignedTo: lead.assignedTo || req.auth.sub,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email || `${lead.leadCode.toLowerCase()}@client.in`,
        panMasked: b.panMasked || "PANPK****1A",
        city: lead.preferredCity,
        correspondenceAddress: b.correspondenceAddress || `${lead.preferredCity}, India`,
        kycVerified: true,
        createdAt: now
      };
      db.customers.unshift(customer);
    }
    const agreementValueInr = Number(b.agreementValueInr);
    const gstRate = prop.category === "commercial" ? 0.12 : prop.category === "plot_land" ? 0 : 0.05;
    const gstAmountInr = b.gstAmountInr !== void 0 ? Number(b.gstAmountInr) : Math.round(agreementValueInr * gstRate);
    const totalPayableInr = agreementValueInr + gstAmountInr;
    const closedBy = lead.assignedTo || req.auth.sub;
    const booking = {
      id: newId("bk"),
      bookingCode: `BK-IND-2026-${db.bookings.length + 10}`,
      leadId: lead.id,
      customerId: customer.id,
      projectId: prop.projectId || lead.projectId || db.projects[0].id,
      propertyId: prop.id,
      closedBy,
      agreementValueInr,
      gstAmountInr,
      totalPayableInr,
      bookingDate: formatIstDate(/* @__PURE__ */ new Date()),
      status: "confirmed",
      retentionUntil: "2034-11-17",
      createdAt: now
    };
    db.bookings.unshift(booking);
    prop.status = "booked";
    lead.stage = "booked";
    lead.updatedAt = now;
    if (prop.projectId) {
      const prj = db.projects.find((p) => p.id === prop.projectId);
      if (prj && prj.availableUnits > 0) prj.availableUnits -= 1;
    }
    const tokenAmt = Math.round(totalPayableInr * 0.2);
    db.payments.unshift(
      {
        id: newId("pay"),
        bookingId: booking.id,
        milestoneName: "Balance Agreement & Possession (80%)",
        amountInr: totalPayableInr - tokenAmt,
        dueDate: formatIstDate(new Date(Date.now() + 30 * 864e5)),
        paidDate: null,
        paymentMode: null,
        utrReference: null,
        status: "pending",
        createdAt: now
      },
      {
        id: newId("pay"),
        bookingId: booking.id,
        milestoneName: "Booking Token (20%)",
        amountInr: tokenAmt,
        dueDate: formatIstDate(/* @__PURE__ */ new Date()),
        paidDate: b.tokenPaid ? formatIstDate(/* @__PURE__ */ new Date()) : null,
        paymentMode: b.tokenPaid ? b.paymentMode || "neft_rtgs" : null,
        utrReference: b.tokenPaid ? b.utrReference || `UTR${Date.now()}` : null,
        status: b.tokenPaid ? "paid" : "pending",
        createdAt: now
      }
    );
    const emp = db.users.find((u) => u.id === closedBy);
    const rate = emp?.commissionRatePct || 1.5;
    const gross = Math.round(agreementValueInr * rate / 100);
    const tds = Math.round(gross * 0.05);
    db.commissions.unshift({
      id: newId("com"),
      bookingId: booking.id,
      employeeId: closedBy,
      commissionRatePct: rate,
      grossAmountInr: gross,
      tdsDeductedInr: tds,
      netPayableInr: gross - tds,
      status: "pending",
      approvedBy: null,
      paidAt: null,
      createdAt: now
    });
    saveDb();
    writeAuditLog({
      actorUserId: req.auth.sub,
      actorName: req.auth.fullName,
      actorRole: req.auth.roleCode,
      action: "BOOKING_CREATED",
      entityType: "bookings",
      entityId: booking.id,
      details: { bookingCode: booking.bookingCode, totalPayableInr },
      ipAddress: req.ip || "127.0.0.1"
    });
    res.status(201).json(booking);
  });
  app.get("/api/payments", requireAuth, (req, res) => {
    const db = getDb();
    if (req.auth.roleCode === "sales_exec") {
      const myBookingIds = new Set(
        db.bookings.filter((b) => b.closedBy === req.auth.sub).map((b) => b.id)
      );
      return res.json(db.payments.filter((p) => myBookingIds.has(p.bookingId)));
    }
    res.json(db.payments);
  });
  app.patch(
    "/api/payments/:id",
    requireAuth,
    requireRoles("admin", "finance", "sales_manager"),
    (req, res) => {
      const db = getDb();
      const pay = db.payments.find((p) => p.id === req.params.id);
      if (!pay) return res.status(404).json({ error: "Payment not found." });
      if (req.body.status) pay.status = req.body.status;
      if (req.body.paymentMode) pay.paymentMode = req.body.paymentMode;
      if (req.body.utrReference) pay.utrReference = req.body.utrReference;
      if (req.body.status === "paid") pay.paidDate = formatIstDate(/* @__PURE__ */ new Date());
      saveDb();
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "PAYMENT_UPDATED",
        entityType: "payments",
        entityId: pay.id,
        details: { status: pay.status, utrReference: pay.utrReference },
        ipAddress: req.ip || "127.0.0.1"
      });
      res.json(pay);
    }
  );
  app.get("/api/commissions", requireAuth, (req, res) => {
    const db = getDb();
    const list = db.commissions.filter(
      (c) => req.auth.roleCode === "sales_exec" ? c.employeeId === req.auth.sub : true
    );
    res.json(list);
  });
  app.patch(
    "/api/commissions/:id",
    requireAuth,
    requireRoles("admin", "finance"),
    (req, res) => {
      const db = getDb();
      const com = db.commissions.find((c) => c.id === req.params.id);
      if (!com) return res.status(404).json({ error: "Commission not found." });
      if (req.body.status) {
        com.status = req.body.status;
        if (req.body.status === "approved") com.approvedBy = req.auth.sub;
        if (req.body.status === "paid") {
          com.approvedBy = com.approvedBy || req.auth.sub;
          com.paidAt = (/* @__PURE__ */ new Date()).toISOString();
        }
      }
      saveDb();
      res.json(com);
    }
  );
  app.get("/api/campaigns", requireAuth, (_req, res) => {
    res.json(getDb().campaigns);
  });
  app.post(
    "/api/campaigns",
    requireAuth,
    requireRoles("admin", "sales_manager"),
    (req, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.name || !b.templateMessage) {
        return res.status(400).json({ error: "name and templateMessage are required." });
      }
      const campaign = {
        id: newId("cmp"),
        name: String(b.name),
        channel: b.channel || "whatsapp",
        targetTemperature: b.targetTemperature || "all",
        targetCity: b.targetCity || null,
        projectId: b.projectId || null,
        templateMessage: String(b.templateMessage),
        languageCode: b.languageCode || "en",
        status: "draft",
        sentCount: 0,
        skippedOptOutCount: 0,
        createdBy: req.auth.sub,
        lastRunAt: null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.campaigns.unshift(campaign);
      saveDb();
      res.status(201).json(campaign);
    }
  );
  app.post(
    "/api/campaigns/:id/run",
    requireAuth,
    requireRoles("admin", "sales_manager"),
    (req, res) => {
      const db = getDb();
      const cmp = db.campaigns.find((c) => c.id === req.params.id);
      if (!cmp) return res.status(404).json({ error: "Campaign not found." });
      const matchingLeads = db.leads.filter((l) => {
        if (cmp.targetTemperature !== "all" && l.temperature !== cmp.targetTemperature) return false;
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
      cmp.status = "completed";
      cmp.lastRunAt = (/* @__PURE__ */ new Date()).toISOString();
      saveDb();
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "CAMPAIGN_EXECUTED",
        entityType: "campaigns",
        entityId: cmp.id,
        details: { sentCount: sent, skippedOptOutCount: skipped },
        ipAddress: req.ip || "127.0.0.1"
      });
      res.json(cmp);
    }
  );
  app.get("/api/employees", requireAuth, (_req, res) => {
    const db = getDb();
    res.json(db.users.map(stripPassword));
  });
  app.post(
    "/api/employees",
    requireAuth,
    requireRoles("admin"),
    (req, res) => {
      const db = getDb();
      const b = req.body ?? {};
      if (!b.fullName || !b.email || !b.phone || !b.roleCode) {
        return res.status(400).json({ error: "fullName, email, phone, and roleCode are required." });
      }
      if (db.users.some((u) => u.email.toLowerCase() === String(b.email).toLowerCase())) {
        return res.status(409).json({ error: "Employee email already exists." });
      }
      const role = db.roles.find((r) => r.code === b.roleCode);
      if (!role) return res.status(400).json({ error: "Invalid roleCode." });
      const user = {
        id: newId("usr"),
        roleId: role.id,
        roleCode: role.code,
        roleName: role.name,
        fullName: String(b.fullName),
        email: String(b.email).toLowerCase(),
        phone: String(b.phone),
        city: b.city || "Bengaluru",
        monthlyTargetInr: Number(b.monthlyTargetInr) || 25e6,
        commissionRatePct: Number(b.commissionRatePct) || 1.5,
        isActive: true,
        lastLoginAt: null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        passwordHash: hashPassword(b.password || "Avasa@2026!")
      };
      db.users.push(user);
      saveDb();
      writeAuditLog({
        actorUserId: req.auth.sub,
        actorName: req.auth.fullName,
        actorRole: req.auth.roleCode,
        action: "EMPLOYEE_CREATED",
        entityType: "users",
        entityId: user.id,
        details: { email: user.email, role: user.roleCode },
        ipAddress: req.ip || "127.0.0.1"
      });
      res.status(201).json(stripPassword(user));
    }
  );
  app.get("/api/roles", requireAuth, (_req, res) => {
    const db = getDb();
    res.json({
      roles: db.roles,
      permissions: db.permissions,
      rolePermissions: db.rolePermissions
    });
  });
  app.get("/api/audit-logs", requireAuth, requireRoles("admin"), (_req, res) => {
    res.json(getDb().auditLogs);
  });
  app.get("/api/reports/export", requireAuth, (req, res) => {
    const db = getDb();
    const accessibleLeads = db.leads.filter(
      (l) => canAccessLead(req.auth.sub, req.auth.roleCode, l)
    );
    const header = "Lead Code,Name,Phone,City,Category,Transaction,Source,Temperature,Stage,Max Budget INR,Created At\n";
    const rows = accessibleLeads.map(
      (l) => `"${l.leadCode}","${l.fullName}","${l.phone}","${l.preferredCity}","${l.interestedCategory}","${l.transactionIntent}","${l.source}","${l.temperature}","${l.stage}",${l.budgetMaxInr},"${l.createdAt}"`
    ).join("\n");
    writeAuditLog({
      actorUserId: req.auth.sub,
      actorName: req.auth.fullName,
      actorRole: req.auth.roleCode,
      action: "REPORT_CSV_EXPORTED",
      entityType: "leads",
      details: { rowCount: accessibleLeads.length },
      ipAddress: req.ip || "127.0.0.1"
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="avasa_leads_report.csv"');
    res.send(header + rows);
  });
  app.get("/api/database/sql/:file", requireAuth, (req, res) => {
    const allowed = ["001_schema.sql", "002_rls_and_indexes.sql", "003_seed_data.sql"];
    const file = req.params.file;
    if (!allowed.includes(file)) {
      return res.status(404).json({ error: "SQL file not found." });
    }
    const fullPath = path2.resolve(process.cwd(), "database", file);
    if (!fs2.existsSync(fullPath)) {
      return res.status(404).json({ error: "SQL migration missing on disk." });
    }
    res.json({ filename: file, sql: fs2.readFileSync(fullPath, "utf8") });
  });
  app.post(
    "/api/database/backup",
    requireAuth,
    requireRoles("admin"),
    (req, res) => {
      const result = createDatabaseBackup(
        req.auth.sub,
        req.auth.fullName,
        req.auth.roleCode
      );
      res.status(201).json(result);
    }
  );
  app.get("/api/docs", requireAuth, (_req, res) => {
    res.json(CRM_DOCUMENTATION);
  });
  return app;
}
async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3e3;
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path2.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(distDir, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Avasa Realty CRM server listening on http://0.0.0.0:${PORT} (IST)`);
  });
}
var isDirectRun = process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));
if (isDirectRun) {
  startServer();
}
export {
  createApp
};
