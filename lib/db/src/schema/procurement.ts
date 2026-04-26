import { pgTable, serial, text, integer, timestamp, pgEnum, numeric, boolean } from "drizzle-orm/pg-core";

export const vendorCategoryEnum = pgEnum("vendor_category", [
  "ingredients", "packaging", "equipment", "services", "logistics", "other"
]);
export const vendorPaymentTermsEnum = pgEnum("vendor_payment_terms", ["net15", "net30", "net60", "cod"]);
export const vendorCurrencyEnum = pgEnum("vendor_currency", ["ngn", "usd", "eur", "gbp"]);
export const vendorStatusEnum = pgEnum("vendor_status", ["active", "inactive", "blacklisted"]);

export const prPriorityEnum = pgEnum("pr_priority", ["low", "medium", "high", "critical"]);
export const prStatusEnum = pgEnum("pr_status", [
  "draft", "pending_approval", "approved", "rejected", "cancelled", "converted_to_po"
]);
export const prApprovalStatusEnum = pgEnum("pr_approval_status", ["pending", "approved", "rejected"]);

export const poStatusEnum = pgEnum("po_status", [
  "draft", "sent_to_vendor", "acknowledged", "in_transit",
  "partially_received", "received", "closed", "cancelled"
]);
export const poPaymentStatusEnum = pgEnum("po_payment_status", ["unpaid", "partially_paid", "paid"]);
export const poItemUnitEnum = pgEnum("po_item_unit", ["kg", "litres", "units", "cartons", "bags", "packs"]);
export const receiptConditionEnum = pgEnum("receipt_condition", ["good", "damaged", "partial"]);

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: vendorCategoryEnum("category").notNull().default("other"),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  country: text("country").notNull().default(""),
  address: text("address").notNull().default(""),
  paymentTerms: text("payment_terms").notNull().default(""),
  currency: vendorCurrencyEnum("currency").notNull().default("ngn"),
  rating: integer("rating").notNull().default(3),
  status: vendorStatusEnum("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const purchaseRequestsTable = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  requestedById: integer("requested_by_id").notNull(),
  departmentId: integer("department_id"),
  vendorId: integer("vendor_id"),
  category: vendorCategoryEnum("category").notNull().default("other"),
  priority: prPriorityEnum("priority").notNull().default("medium"),
  status: prStatusEnum("status").notNull().default("draft"),
  estimatedAmount: numeric("estimated_amount", { precision: 15, scale: 2 }),
  currency: vendorCurrencyEnum("currency").notNull().default("ngn"),
  requiredByDate: text("required_by_date"),
  justification: text("justification").default(""),
  attachmentUrl: text("attachment_url"),
  requiredQuantityKg: text("required_quantity_kg"),
  vendorDetailsName: text("vendor_details_name"),
  vendorDetailsAddress: text("vendor_details_address"),
  deletedAt: timestamp("deleted_at"),
  deletedById: integer("deleted_by_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const purchaseRequestApprovalsTable = pgTable("purchase_request_approvals", {
  id: serial("id").primaryKey(),
  purchaseRequestId: integer("purchase_request_id").notNull(),
  approverId: integer("approver_id").notNull(),
  level: integer("level").notNull().default(1),
  status: prApprovalStatusEnum("status").notNull().default("pending"),
  comment: text("comment").default(""),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  purchaseRequestId: integer("purchase_request_id"),
  vendorId: integer("vendor_id").notNull(),
  raisedById: integer("raised_by_id").notNull(),
  status: poStatusEnum("status").notNull().default("draft"),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }),
  currency: vendorCurrencyEnum("currency").notNull().default("ngn"),
  paymentStatus: poPaymentStatusEnum("payment_status").notNull().default("unpaid"),
  paymentDue: text("payment_due"),
  deliveryAddress: text("delivery_address").default(""),
  deliveryDue: text("delivery_due"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit: poItemUnitEnum("unit").notNull().default("units"),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 15, scale: 2 }).notNull(),
  productType: text("product_type"),
  notes: text("notes").default(""),
});

export const purchaseOrderReceiptsTable = pgTable("purchase_order_receipts", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  receivedById: integer("received_by_id").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  quantityReceived: numeric("quantity_received", { precision: 12, scale: 3 }),
  condition: receiptConditionEnum("condition").notNull().default("good"),
  notes: text("notes").default(""),
});

export const vendorPerformanceTable = pgTable("vendor_performance", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  purchaseOrderId: integer("purchase_order_id").notNull(),
  deliveryScore: integer("delivery_score").notNull().default(3),
  qualityScore: integer("quality_score").notNull().default(3),
  communicationScore: integer("communication_score").notNull().default(3),
  overallScore: numeric("overall_score", { precision: 4, scale: 2 }),
  reviewedById: integer("reviewed_by_id").notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Vendor = typeof vendorsTable.$inferSelect;
export type PurchaseRequest = typeof purchaseRequestsTable.$inferSelect;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItemsTable.$inferSelect;
