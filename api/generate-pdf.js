// api/generate-pdf.js
import { chromium } from "playwright";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    // API key check
    const expectedKey = process.env.GENERATE_PDF_API_KEY;
    const providedKey = req.headers["x-api-key"] || (req.body && req.body.apiKey);
    if (!expectedKey || providedKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};
    const targetUrl = body.url || process.env.INVOICE_HTML_URL;
    const payload = body.data || {};
    const filename = (body.filename || (payload.invoice && payload.invoice.number) || "invoice") + ".pdf";

    if (!targetUrl) {
      return res.status(400).json({ error: "Missing INVOICE_HTML_URL or body.url" });
    }

    // Launch Chromium via Playwright
    const browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });

    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await context.newPage();

    // Load invoice page
    await page.goto(targetUrl, { waitUntil: "networkidle" });

    // Inject data into page DOM (do not override logo)
    await page.evaluate(async (data) => {
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (!el || val === undefined || val === null) return;
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };

      if (data.seller) {
        setVal("sellerName", data.seller.name);
        setVal("sellerAddress", data.seller.address);
        setVal("sellerTaxCode", data.seller.taxCode);
        setVal("sellerPhone", data.seller.phone);
      }
      if (data.buyer) {
        setVal("buyerName", data.buyer.name);
        setVal("buyerAddress", data.buyer.address);
        setVal("buyerTaxCode", data.buyer.taxCode);
        setVal("buyerPhone", data.buyer.phone);
      }
      if (data.invoice) {
        setVal("invoiceNumber", data.invoice.number);
        setVal("invoiceDate", data.invoice.date);
        setVal("paymentMethod", data.invoice.paymentMethod);
        setVal("taxRate", data.invoice.taxRate);
        setVal("seriesInput", data.invoice.series);
      }

      if (Array.isArray(data.products)) {
        const list = document.getElementById("productList");
        if (list) {
          list.innerHTML = "";
          if (typeof addProductItem === "function") {
            data.products.forEach(p => addProductItem(p.name || "", p.quantity || 1, p.price || 0, p.unit || ""));
          } else {
            data.products.forEach((p, idx) => {
              const div = document.createElement("div");
              div.className = "product-item";
              div.innerHTML = `
                <div class="product-header"><div class="product-title">Sản phẩm #${idx+1}</div></div>
                <div class="product-grid">
                  <div class="form-group"><label>Tên sản phẩm</label><input type="text" class="product-name" value="${(p.name||'').replace(/"/g,'&quot;')}" /></div>
                  <div class="form-group"><label>Số lượng</label><input type="number" class="product-quantity" min="0" value="${p.quantity||0}" /></div>
                  <div class="form-group"><label>Đơn giá</label><input type="number" class="product-price" min="0" value="${p.price||0}" /></div>
                  <div class="form-group"><label>Đơn vị</label><input type="text" class="product-unit" value="${(p.unit||'').replace(/"/g,'&quot;')}" /></div>
                </div>`;
              list.appendChild(div);
            });
          }
        }
      }

      if (typeof updateInvoicePreview === "function") {
        updateInvoicePreview();
      }
      await new Promise(r => setTimeout(r, 700));
    }, payload);

    // wait for logo/assets to load
    await page.waitForTimeout(600);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" }
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Generated-PDF-Size", String(pdfBuffer.length));
    return res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error("generate-pdf error:", err);
    // return minimal error info (avoid leaking sensitive info); if you want full stack for debugging, add err.stack
    return res.status(500).json({ error: "Internal server error", detail: String(err.message || err) });
  }
}
