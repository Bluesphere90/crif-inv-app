// api/generate-pdf.js
const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const ONE_MB = 1024 * 1024;

module.exports = async (req, res) => {
  try {
    // Auth: require x-api-key header to match env var
    const expectedKey = process.env.GENERATE_PDF_API_KEY;
    const providedKey = req.headers['x-api-key'];
    if (!expectedKey || providedKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized: missing or invalid x-api-key' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    // body: { url? , data? , filename? }
    const body = req.body || {};
    const targetUrl = body.url || process.env.INVOICE_HTML_URL;
    const payload = body.data || {}; // optional invoice data to inject; logo NOT required (API uses HTML's logo)
    const filename = (body.filename || (payload.invoice && payload.invoice.number) || 'invoice') + '.pdf';

    if (!targetUrl) return res.status(400).json({ error: 'Missing INVOICE_HTML_URL and no url provided in body.' });

    // Launch chromium (chrome-aws-lambda compatible)
    const execPath = await chromium.executablePath;
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 800 },
      executablePath: execPath,
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(45000);

    // Load the invoice page (the one you deployed). Wait for network idle.
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });

    // Inject payload into page DOM — but do NOT overwrite existing logo on the page.
    // We fill inputs (seller/buyer/invoice/products) so page's updateInvoicePreview() will show them.
    await page.evaluate(async (data) => {
      // helper to safely set input value if element exists
      function setVal(id, val) {
        const el = document.getElementById(id);
        if (!el || typeof val === 'undefined' || val === null) return;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (data.seller) {
        setVal('sellerName', data.seller.name);
        setVal('sellerAddress', data.seller.address);
        setVal('sellerTaxCode', data.seller.taxCode);
        setVal('sellerPhone', data.seller.phone);
      }
      if (data.buyer) {
        setVal('buyerName', data.buyer.name);
        setVal('buyerAddress', data.buyer.address);
        setVal('buyerTaxCode', data.buyer.taxCode);
        setVal('buyerPhone', data.buyer.phone);
      }
      if (data.invoice) {
        setVal('invoiceNumber', data.invoice.number);
        setVal('invoiceDate', data.invoice.date);
        setVal('paymentMethod', data.invoice.paymentMethod);
        setVal('taxRate', data.invoice.taxRate);
        setVal('seriesInput', data.invoice.series);
      }

      // products: rebuild productList if provided
      if (Array.isArray(data.products) && data.products.length) {
        const productList = document.getElementById('productList');
        if (productList) {
          productList.innerHTML = '';
          // Reuse addProductItem if exists for consistent DOM structure; else build minimal inputs
          if (typeof addProductItem === 'function') {
            data.products.forEach(p => {
              addProductItem(p.name || '', p.quantity || 1, p.price || 0, p.unit || '');
            });
          } else {
            data.products.forEach((p, idx) => {
              const div = document.createElement('div');
              div.className = 'product-item';
              div.innerHTML = `
                <div class="product-header"><div class="product-title">Sản phẩm #${idx+1}</div></div>
                <div class="product-grid">
                  <div class="form-group"><label>Tên sản phẩm</label><input type="text" class="product-name" value="${(p.name||'').replace(/"/g,'&quot;')}"></div>
                  <div class="form-group"><label>Số lượng</label><input type="number" class="product-quantity" min="0" value="${p.quantity||0}"></div>
                  <div class="form-group"><label>Đơn giá</label><input type="number" class="product-price" min="0" value="${p.price||0}"></div>
                  <div class="form-group"><label>Đơn vị</label><input type="text" class="product-unit" value="${(p.unit||'').replace(/"/g,'&quot;')}"></div>
                </div>`;
              productList.appendChild(div);
            });
          }
        }
      }

      // Do not touch logo input on the page — it will use the logo stored in the deployed HTML.
      // Call page's update function if available
      if (typeof updateInvoicePreview === 'function') {
        updateInvoicePreview();
      } else {
        // fallback: trigger input events for key fields for DOM updates
        ['sellerName','buyerName','invoiceNumber','invoiceDate','taxRate','seriesInput'].forEach(id=>{
          const el = document.getElementById(id); if(el) el.dispatchEvent(new Event('input',{bubbles:true}));
        });
      }

      // Wait briefly for fonts/images to settle
      await new Promise(r => setTimeout(r, 900));
      return true;
    }, payload);

    // ensure images (logo) loaded
    await page.waitForTimeout(600);

    // Render PDF using Chromium's printToPDF -> A4 portrait, include backgrounds
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });

    await browser.close();

    // If too large, still return but include size header (client can decide)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Generated-PDF-Size', String(pdfBuffer.length));
    return res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error('generate-pdf error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: String(err) });
  }
};
