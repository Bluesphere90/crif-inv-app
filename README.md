# Invoice PDF generator (Vercel)

## Mục tiêu
Serverless API để render trang invoice HTML -> PDF (giữ nguyên layout/CSS). Phù hợp triển khai Bot Telegram (<= 20 calls/day, PDF ~ <1MB).

## Cấu trúc
- `index.html` (bạn đã cung cấp) — preview + script (updateInvoicePreview, companyLogo, invoicePreview).
- `api/generate-pdf.js` — serverless function.
- `package.json`, `vercel.json`.

## Env vars (set trong Vercel dashboard)
- `GENERATE_PDF_API_KEY` = chuỗi bí mật (bắt buộc).
- `INVOICE_HTML_URL` = đầy đủ URL đến trang invoice (ví dụ: `https://your-site.vercel.app/`).

## Deploy
1. Push repo lên GitHub / GitLab.
2. Kết nối project với Vercel.
3. Đặt `GENERATE_PDF_API_KEY` và `INVOICE_HTML_URL` trong Vercel → Settings → Environment Variables.
4. Deploy.

## Gọi API (ví dụ curl)
```bash
curl -X POST "https://your-vercel-app.vercel.app/api/generate-pdf" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SECRET_KEY" \
  -d '{
    "data": {
      "seller": {"name":"Công Ty A","address":"..."},
      "buyer": {"name":"Công Ty B","address":"..."},
      "invoice": {"number":"HD-001","date":"2025-12-03","taxRate":10,"paymentMethod":"Tiền mặt","series":"1C25"},
      "products": [{"name":"SP1","quantity":1,"price":100000,"unit":"Cái"}]
    },
    "filename": "HD-001.pdf"
  }' --output invoice.pdf
