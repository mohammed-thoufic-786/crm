-- ============================================================================
-- Avasa Realty CRM — Sample Seed Dataset (Migration 003)
-- Indian Real Estate Market | INR Currency | Asia/Kolkata
-- ============================================================================

SET timezone = 'Asia/Kolkata';

-- ROLES
INSERT INTO roles (code, name, description) VALUES
  ('admin', 'Company Admin', 'Full organizational control, RBAC, audit logs, backups, and all PII'),
  ('sales_manager', 'Sales Manager', 'Manages team pipeline, lead assignment, campaigns, and site visits'),
  ('sales_exec', 'Sales Executive', 'Access strictly isolated to assigned leads, customers, visits, and own commissions'),
  ('finance', 'Accounts & Finance', 'Manages bookings, INR payment milestones, GST, and commission payouts')
ON CONFLICT (code) DO NOTHING;

-- PERMISSIONS
INSERT INTO permissions (code, module, description) VALUES
  ('dashboard:view_all', 'dashboard', 'View company-wide revenue, conversion, and employee analytics'),
  ('leads:read_all', 'leads', 'View all leads across all sales executives'),
  ('leads:read_assigned', 'leads', 'View only leads assigned to self'),
  ('leads:assign', 'leads', 'Assign or reassign leads to sales executives'),
  ('customers:read_pii', 'customers', 'View protected customer KYC, phone, email, and PAN'),
  ('properties:manage', 'properties', 'Create and update projects and property inventory'),
  ('whatsapp:reply', 'whatsapp', 'Send WhatsApp messages and control AI chatbot'),
  ('bookings:manage', 'bookings', 'Create bookings and confirm unit reservations'),
  ('payments:manage', 'payments', 'Record INR payments and approve commissions'),
  ('security:audit', 'security', 'View audit logs, manage roles, and run database backups')
ON CONFLICT (code) DO NOTHING;

-- SAMPLE PROJECTS
INSERT INTO projects (code, name, developer_name, rera_id, project_type, city, micro_market, address, total_units, available_units, base_price_min_inr, base_price_max_inr, possession_date, status)
VALUES
  ('PRJ-BLR-01', 'Avasa Skyline Residences', 'Avasa Urban Developers Pvt Ltd', 'PRM/KA/RERA/1251/446/PR/240215/006612', 'residential', 'Bengaluru', 'Whitefield', 'ITPL Main Road, Whitefield, Bengaluru 560066', 240, 48, 12500000.00, 26500000.00, '2027-06-30', 'under_construction'),
  ('PRJ-HYD-02', 'Emerald Courtyard Villas', 'Avasa Luxury Estates LLP', 'P02400007821', 'residential', 'Hyderabad', 'Mokila - Shankarpally', 'Mokila Villa Corridor, Rangareddy, Hyderabad 501203', 64, 14, 34000000.00, 52000000.00, '2026-12-31', 'ready_to_move'),
  ('PRJ-GGN-03', 'Avasa One Tech Plaza', 'Avasa Commercial Realty', 'RC/REP/HARERA/GGM/712/444/2025/19', 'commercial', 'Gurugram', 'Golf Course Extension Road', 'Sector 62, Golf Course Ext Rd, Gurugram 122102', 110, 29, 18500000.00, 74000000.00, '2027-03-31', 'under_construction'),
  ('PRJ-PUN-04', 'Sahyadri Meadow Plots', 'Avasa Landmarks Pvt Ltd', 'P52100054329', 'plotted_development', 'Pune', 'Hinjewadi Phase 3', 'Marunji-Kasarsai Link Road, Pune 411057', 180, 52, 6200000.00, 14800000.00, '2026-09-30', 'ready_to_move')
ON CONFLICT (code) DO NOTHING;

-- SAMPLE PROPERTIES (Apartments, Villas, Plots, Commercial, Rental, Resale)
INSERT INTO properties (project_id, unit_code, title, category, transaction_type, city, locality, configuration, carpet_area_sqft, super_builtup_sqft, facing, floor_number, price_inr, monthly_rent_inr, furnishing, status)
SELECT id, 'BLR-A-1402', 'Skyline Tower A - 3 BHK Corner Skyhome', 'apartment', 'primary_sale', 'Bengaluru', 'Whitefield', '3 BHK + Study', 1480, 2050, 'East', 14, 18500000.00, NULL, 'unfurnished', 'available'
FROM projects WHERE code = 'PRJ-BLR-01'
ON CONFLICT (unit_code) DO NOTHING;

INSERT INTO properties (project_id, unit_code, title, category, transaction_type, city, locality, configuration, carpet_area_sqft, super_builtup_sqft, facing, floor_number, price_inr, monthly_rent_inr, furnishing, status)
SELECT id, 'HYD-V-09', 'Emerald Courtyard - 4 BHK Private Pool Villa', 'villa', 'primary_sale', 'Hyderabad', 'Mokila', '4 BHK Villa', 3200, 4150, 'North', 0, 42500000.00, NULL, 'semi_furnished', 'available'
FROM projects WHERE code = 'PRJ-HYD-02'
ON CONFLICT (unit_code) DO NOTHING;

INSERT INTO properties (project_id, unit_code, title, category, transaction_type, city, locality, configuration, carpet_area_sqft, super_builtup_sqft, facing, floor_number, price_inr, monthly_rent_inr, furnishing, status)
SELECT id, 'GGN-C-704', 'Avasa One Tech Plaza - Grade-A Corner Office', 'commercial', 'primary_sale', 'Gurugram', 'Sector 62', '3,100 sq.ft Office', 2350, 3100, 'North-East', 7, 37200000.00, NULL, 'semi_furnished', 'available'
FROM projects WHERE code = 'PRJ-GGN-03'
ON CONFLICT (unit_code) DO NOTHING;

INSERT INTO properties (project_id, unit_code, title, category, transaction_type, city, locality, configuration, carpet_area_sqft, super_builtup_sqft, facing, floor_number, price_inr, monthly_rent_inr, furnishing, status)
SELECT id, 'PUN-P-118', 'Sahyadri Meadows - Corner NA Residential Plot', 'plot_land', 'primary_sale', 'Pune', 'Hinjewadi Phase 3', '2,400 sq.ft Plot', 2400, 2400, 'East', 0, 9600000.00, NULL, 'unfurnished', 'available'
FROM projects WHERE code = 'PRJ-PUN-04'
ON CONFLICT (unit_code) DO NOTHING;

INSERT INTO properties (project_id, unit_code, title, category, transaction_type, city, locality, configuration, carpet_area_sqft, super_builtup_sqft, facing, floor_number, price_inr, monthly_rent_inr, furnishing, status)
VALUES
  (NULL, 'MUM-RNT-22', 'Worli Sea-View Furnished 3 BHK Corporate Lease', 'residential', 'rental', 'Mumbai', 'Worli', '3 BHK Luxury', 1520, 1980, 'West', 22, 95000000.00, 185000.00, 'fully_furnished', 'available'),
  (NULL, 'BLR-RSL-08', 'Indiranagar 100ft Rd Boutique Resale Villa', 'villa', 'resale', 'Bengaluru', 'Indiranagar', '4 BHK Independent', 2900, 3400, 'North', 0, 56000000.00, NULL, 'fully_furnished', 'available')
ON CONFLICT (unit_code) DO NOTHING;
