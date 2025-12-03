// api/generate-pdf.js
import chromium from "@playwright/browser-chromium";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    // API key check
    const expectedKey = process.env.GENERATE_PDF_API_KEY;
    const providedKey =
      req.headers["x-api-key"] || (req.body && req.body.apiKey);

    if (!expectedKey || providedKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};
    const targetUrl = body.url || process.env.INVOICE_HTML_URL;
    const payload = body.data || {};
    const filename =
      (body.filename ||
        (payload.invoice && payload.invoice.number) ||
        "invoice") + ".pdf";

    if (!targetUrl)
      return res
        .status(400)
        .json({ error: "Missing INVOICE_HTML_URL or body.url" });

    // Launch Playwright Chromium
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1200, height: 800 }
    });
    const page = await context.newPage();

    // Load invoice HTML page
    await page.goto(targetUrl, { waitUntil: "networkidle" });

    // Inject data (no logo override)
    await page.evaluate(async (data) => {
      function setVal(id, val) {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) {
          el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

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
            data.products.forEach((p) =>
              addProductItem(
                p.name || "",
                p.quantity || 1,
                p.price || 0,
                p.unit || ""
              )
            );
          }
        }
      }

      if (typeof updateInvoicePreview === "function") {
        updateInvoicePreview();
      }

      await new Promise((r) => setTimeout(r, 500));
    }, payload);

    await page.waitForTimeout(500);

    // Generate PDF using Playwright
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        bottom: "10mm",
        left: "10mm",
        right: "10mm"
      }
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).json({ error: "Internal server error", detail: String(err) });
  }
}
