// CSV / XLSX export helpers for the Materials & Demand Planning module.
import * as XLSX from "xlsx";
import type { Account, ProductionOrder, MonthlyOrder, ProducedOrder, ProductionHistoryView } from "./types";
import { formatDate, formatDateTime, getHistoryFileRange } from "./helpers";

export function downloadCsv(accounts: Account[]) {
  const headers = ["Company", "Product Name", "Product Type", "Urgency", "Volume", "Account Manager(s)", "Date Added"];
  const rows = accounts.map((a) => [
    a.company,
    a.productName ?? "-",
    a.productType ?? "-",
    a.urgencyLevel,
    a.volume ?? "0",
    (a.accountManagerNames || []).join(", ") || "-",
    formatDate(a.createdAt),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `customer-products-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadProductionOrdersCsv(orders: ProductionOrder[]) {
  const headers = ["Order ID", "Account", "Product", "Product Type", "Volume (KG)", "Raw Material", "Microbial Analysis", "Remarks", "Status"];
  const rows = orders.map((order) => [
    order.id,
    order.accountName ?? order.accountCompany ?? "Unknown",
    order.productName ?? order.productType ?? "-",
    order.productType ?? "-",
    String(order.volume ?? "-"),
    order.rawMaterialStatus ?? "Pending",
    order.microbialAnalysis ?? "Normal",
    order.remarks ?? "",
    order.orderStatus ?? "Ordered",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `production-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadProductionOrdersXlsx(orders: ProductionOrder[]) {
  const worksheetData = [
    ["Order ID", "Account", "Product", "Product Type", "Volume (KG)", "Raw Material", "Microbial Analysis", "Remarks", "Status"],
    ...orders.map((order) => [
      order.id,
      order.accountName ?? order.accountCompany ?? "Unknown",
      order.productName ?? order.productType ?? "-",
      order.productType ?? "-",
      Number(order.volume ?? 0),
      order.rawMaterialStatus ?? "Pending",
      order.microbialAnalysis ?? "Normal",
      order.remarks ?? "",
      order.orderStatus ?? "Ordered",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "ProductionOrders");
  XLSX.writeFile(workbook, `production-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function downloadMonthlyOrdersXlsx(orders: MonthlyOrder[]) {
  const worksheetData = [
    ["Customer Name", "Product Description", "Volume (KG)", "Date Ordered", "Expected Delivery", "Production Status", "Distribution", "Packing", "Delivery"],
    ...orders.map((order) => [
      order.customerName ?? "Unknown",
      order.productDescription ?? "-",
      Number(order.volumeKg ?? 0),
      order.dateOrdered ?? "-",
      (order as any).expectedDeliveryDate ?? "-",   // preserved verbatim: field absent on MonthlyOrder → "-" at runtime
      order.productionStatus ?? "Pending",
      order.distributionType ?? "-",
      order.packingStatus ?? "Not Packed",
      order.deliveryStatus ?? "No",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "MonthlyOrders");
  XLSX.writeFile(workbook, `monthly-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function downloadMonthlyOrdersCsv(orders: MonthlyOrder[]) {
  const headers = ["Customer Name", "Product Description", "Volume (KG)", "Date Ordered", "Expected Delivery", "Production Status", "Distribution", "Packing", "Delivery"];
  const rows = orders.map((order) => [
    order.customerName ?? "Unknown",
    order.productDescription ?? "-",
    String(order.volumeKg ?? "0"),
    order.dateOrdered ?? "-",
    (order as any).expectedDeliveryDate ?? "-",   // preserved verbatim: field absent on MonthlyOrder → "-" at runtime
    order.productionStatus ?? "Pending",
    order.distributionType ?? "-",
    order.packingStatus ?? "Not Packed",
    order.deliveryStatus ?? "No",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `monthly-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadProductionHistoryCsv(records: ProducedOrder[], view: ProductionHistoryView) {
  const headers = ["Account/Product", "Product Type", "Volume (KG)", "Produced At", "Delivery Status"];
  const rows = records.map((record) => [
    `${record.accountName} | ${record.productName}`,
    record.productType,
    String(record.volume),
    formatDateTime(record.producedAt),
    record.deliveryStatus,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `production_history_${view}_${getHistoryFileRange(view)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadProductionHistoryXlsx(records: ProducedOrder[], view: ProductionHistoryView) {
  const worksheetData = [
    ["Account/Product", "Product Type", "Volume (KG)", "Produced At", "Delivery Status"],
    ...records.map((record) => [
      `${record.accountName} | ${record.productName}`,
      record.productType,
      record.volume,
      formatDateTime(record.producedAt),
      record.deliveryStatus,
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "ProductionHistory");
  XLSX.writeFile(workbook, `production_history_${view}_${getHistoryFileRange(view)}.xlsx`);
}
