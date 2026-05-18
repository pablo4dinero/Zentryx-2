import { logger } from "./logger";

export interface ProductionOrderMailData {
  orderNumber: number;
  account: string;
  product: string;
  volume: string | null;
  dateOrdered: string | null;
  expectedDeliveryDate: string | null;
}

export async function sendProductionOrderNotification(
  recipients: { name: string; email: string }[],
  order: ProductionOrderMailData,
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    logger.info("[Mail] Dev mode — RESEND_API_KEY not set, skipping production order emails");
    return;
  }
  if (recipients.length === 0) {
    logger.info("[Mail] No active recipients found, skipping");
    return;
  }

  logger.info({ count: recipients.length }, "[Mail] Sending production order notification");

  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const dateLine = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const html = buildOrderEmail(order, dateLine);
  const subject = `New Production Order #${order.orderNumber} — ${order.account}`;

  const results = await Promise.allSettled(
    recipients.map(r =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Zentryx R&D <${fromEmail}>`,
          to: [r.email],
          subject,
          html,
        }),
      }).then(async res => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Resend ${res.status}: ${body}`);
        }
        return res.json();
      })
    )
  );

  const failed = results.filter(r => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length > 0) {
    logger.error({ reasons: failed.map(f => String(f.reason)) }, `[Mail] ${failed.length}/${recipients.length} production order emails failed`);
  } else {
    logger.info(`[Mail] Production order #${order.orderNumber} notification sent to ${recipients.length} recipient(s)`);
  }
}

function row(label: string, value: string) {
  return `
    <tr>
      <td style="padding:11px 18px;font-size:13px;color:#94a3b8;white-space:nowrap;width:170px;border-bottom:1px solid #1e293b">${label}</td>
      <td style="padding:11px 18px;font-size:13px;color:#f1f5f9;font-weight:500;border-bottom:1px solid #1e293b">${value || "—"}</td>
    </tr>`;
}

function buildOrderEmail(order: ProductionOrderMailData, dateLine: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 0;background:#06060f">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0a0a14;border-radius:16px;overflow:hidden;border:1px solid #1e293b">

    <!-- Header band -->
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#db2777 100%);padding:28px 32px 24px">
      <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,0.65)">Zentryx R&D Intelligence</p>
      <h1 style="margin:4px 0 0;font-size:22px;font-weight:700;color:#fff;line-height:1.2">New Production Order</h1>
      <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.6)">${dateLine}</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="margin:0 0 22px;font-size:14px;color:#94a3b8;line-height:1.65">
        A new production order has been raised in the Sales Force module.
        Review the details below and action accordingly.
      </p>

      <!-- Order details table -->
      <table style="width:100%;border-collapse:collapse;background:#111827;border-radius:12px;overflow:hidden;border:1px solid #1e293b">
        <thead>
          <tr style="background:#1a1f2e">
            <th colspan="2" style="padding:13px 18px;text-align:left;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#a78bfa;border-bottom:1px solid #1e293b">
              Order Summary
            </th>
          </tr>
        </thead>
        <tbody>
          ${row("Order No.", `#${order.orderNumber}`)}
          ${row("Account", order.account)}
          ${row("Product", order.product)}
          ${row("Volume", order.volume ? `${order.volume} kg` : "—")}
          ${row("Date Ordered", order.dateOrdered || "—")}
          ${row("Expected Delivery", order.expectedDeliveryDate || "—")}
        </tbody>
      </table>

      <!-- CTA note -->
      <div style="margin-top:22px;padding:14px 18px;background:#1a1a2e;border-radius:10px;border-left:3px solid #7c3aed">
        <p style="margin:0;font-size:13px;color:#c4b5fd;font-weight:500">
          Log in to Zentryx to view, track, or update this order in the Sales Force module.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #1e293b;background:#070710">
      <p style="margin:0;font-size:11px;color:#374151;line-height:1.5">
        Zentryx R&D Intelligence Suite &nbsp;·&nbsp; Automated Production Order Notification<br>
        You are receiving this because you are a member of the Zentryx team directory.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}
