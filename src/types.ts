export type RoleCode = 'admin' | 'sales_manager' | 'sales_exec' | 'finance';

export type PropertyCategory = 'residential' | 'commercial' | 'plot_land' | 'villa' | 'apartment';
export type TransactionType = 'primary_sale' | 'resale' | 'rental';
export type LeadTemperature = 'hot' | 'warm' | 'cold';
export type LeadStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'site_visit_scheduled'
  | 'site_visit_done'
  | 'negotiation'
  | 'booked'
  | 'lost';

export type LeadSource =
  | 'whatsapp'
  | 'website'
  | 'magicbricks'
  | '99acres'
  | 'housing_com'
  | 'meta_ads'
  | 'google_ads'
  | 'referral'
  | 'walk_in';

export interface RoleRecord {
  id: number;
  code: RoleCode;
  name: string;
  description: string;
}

export interface PermissionRecord {
  id: number;
  code: string;
  module: string;
  description: string;
}

export interface UserRecord {
  id: string;
  roleId: number;
  roleCode: RoleCode;
  roleName: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  monthlyTargetInr: number;
  commissionRatePct: number;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  code: string;
  name: string;
  developerName: string;
  reraId: string;
  projectType: 'residential' | 'commercial' | 'plotted_development' | 'mixed_use';
  city: string;
  microMarket: string;
  address: string;
  totalUnits: number;
  availableUnits: number;
  basePriceMinInr: number;
  basePriceMaxInr: number;
  possessionDate: string;
  status: 'pre_launch' | 'under_construction' | 'ready_to_move' | 'sold_out';
  imageUrl: string;
  createdAt: string;
}

export interface PropertyRecord {
  id: string;
  projectId: string | null;
  unitCode: string;
  title: string;
  category: PropertyCategory;
  transactionType: TransactionType;
  city: string;
  locality: string;
  configuration: string;
  carpetAreaSqft: number;
  superBuiltupSqft: number;
  facing: string;
  floorNumber: number | null;
  priceInr: number;
  monthlyRentInr: number | null;
  securityDepositInr: number | null;
  furnishing: 'unfurnished' | 'semi_furnished' | 'fully_furnished';
  status: 'available' | 'reserved' | 'booked' | 'sold' | 'rented';
  createdAt: string;
}

export interface LeadRecord {
  id: string;
  leadCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  preferredLanguage: string;
  source: LeadSource;
  temperature: LeadTemperature;
  stage: LeadStage;
  interestedCategory: PropertyCategory;
  transactionIntent: TransactionType;
  preferredCity: string;
  preferredLocality: string | null;
  budgetMinInr: number;
  budgetMaxInr: number;
  projectId: string | null;
  assignedTo: string | null;
  aiSummary: string | null;
  lastContactedAt: string | null;
  retentionExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRecord {
  id: string;
  leadId: string | null;
  assignedTo: string | null;
  fullName: string;
  phone: string;
  email: string;
  panMasked: string;
  city: string;
  correspondenceAddress: string;
  kycVerified: boolean;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  leadId: string | null;
  customerId: string | null;
  contactName: string;
  phone: string;
  channel: 'whatsapp' | 'sms' | 'email' | 'voice';
  purpose: 'sales_followup' | 'marketing_campaigns' | 'ai_chatbot' | 'kyc_processing';
  status: 'granted' | 'withdrawn' | 'opted_out';
  sourceProof: string;
  grantedAt: string | null;
  withdrawnAt: string | null;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  leadId: string;
  assignedTo: string | null;
  channel: 'whatsapp' | 'web_chat';
  waPhone: string;
  detectedLanguage: string;
  aiEnabled: boolean;
  status: 'open' | 'handed_over' | 'closed' | 'opted_out';
  lastMessageAt: string;
  createdAt: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'customer' | 'ai_bot' | 'employee';
  senderUserId: string | null;
  body: string;
  languageCode: string;
  waMessageId: string | null;
  deliveryStatus: 'queued' | 'sent' | 'delivered' | 'read' | 'blocked_opt_out' | 'failed';
  createdAt: string;
}

export interface SiteVisitRecord {
  id: string;
  leadId: string;
  projectId: string;
  propertyId: string | null;
  assignedTo: string;
  scheduledAt: string;
  completedAt: string | null;
  status: 'scheduled' | 'completed' | 'rescheduled' | 'cancelled' | 'no_show';
  pickupRequired: boolean;
  feedback: string | null;
  rating: number | null;
  createdAt: string;
}

export interface BookingRecord {
  id: string;
  bookingCode: string;
  leadId: string;
  customerId: string;
  projectId: string;
  propertyId: string;
  closedBy: string;
  agreementValueInr: number;
  gstAmountInr: number;
  totalPayableInr: number;
  bookingDate: string;
  status: 'pending_token' | 'confirmed' | 'registered' | 'cancelled';
  retentionUntil: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  milestoneName: string;
  amountInr: number;
  dueDate: string;
  paidDate: string | null;
  paymentMode: 'neft_rtgs' | 'upi' | 'cheque' | 'demand_draft' | 'home_loan_disbursement' | null;
  utrReference: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'refunded';
  createdAt: string;
}

export interface CommissionRecord {
  id: string;
  bookingId: string;
  employeeId: string;
  commissionRatePct: number;
  grossAmountInr: number;
  tdsDeductedInr: number;
  netPayableInr: number;
  status: 'pending' | 'approved' | 'paid' | 'clawback';
  approvedBy: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface FollowUpRecord {
  id: string;
  leadId: string;
  assignedTo: string;
  channel: 'call' | 'whatsapp' | 'email' | 'in_person';
  dueAt: string;
  notes: string;
  isAutomated: boolean;
  status: 'pending' | 'completed' | 'missed' | 'cancelled';
  completedAt: string | null;
  createdAt: string;
}

export interface CampaignRecord {
  id: string;
  name: string;
  channel: 'whatsapp' | 'email' | 'sms';
  targetTemperature: 'all' | 'hot' | 'warm' | 'cold';
  targetCity: string | null;
  projectId: string | null;
  templateMessage: string;
  languageCode: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
  sentCount: number;
  skippedOptOutCount: number;
  createdBy: string;
  lastRunAt: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  actorUserId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export interface DashboardMetrics {
  kpis: {
    totalEnquiries: number;
    todaysEnquiries: number;
    newLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    followUpsPending: number;
    siteVisitsScheduled: number;
    siteVisitsCompleted: number;
    bookingsConfirmed: number;
    totalRevenueInr: number;
    collectedRevenueInr: number;
    pendingPaymentsInr: number;
    conversionRatePct: number;
  };
  employeePerformance: Array<{
    employeeId: string;
    name: string;
    city: string;
    leadsAssigned: number;
    siteVisitsDone: number;
    bookingsClosed: number;
    revenueInr: number;
    targetInr: number;
    attainmentPct: number;
  }>;
  leadSourceAnalytics: Array<{
    source: string;
    count: number;
    bookings: number;
    conversionPct: number;
  }>;
  monthlySalesGraph: Array<{
    month: string;
    bookings: number;
    revenueInr: number;
    enquiries: number;
  }>;
  projectWiseSales: Array<{
    projectId: string;
    projectName: string;
    city: string;
    bookingsCount: number;
    revenueInr: number;
    availableUnits: number;
    totalUnits: number;
  }>;
}
