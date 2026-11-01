// Gửi email qua Resend (HTTP API, không cần thêm thư viện; Render gói miễn phí chặn cổng SMTP nên không dùng SMTP).
// Cấu hình: RESEND_API_KEY và MAIL_FROM (ví dụ "NSHV <no-reply@ten-mien-cua-ban.vn>").
// Chưa cấu hình: in liên kết ra log của server (chỉ dùng khi chạy thử, không gửi gì cho người dùng).
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM;
  if (!key || !from) {
    console.warn(`[mail] Chưa cấu hình RESEND_API_KEY/MAIL_FROM. Email tới ${to}:\n${text}`);
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!r.ok) throw new Error(`Gửi email thất bại (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return true;
}
