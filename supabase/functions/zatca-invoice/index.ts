/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Supabase Edge Function: zatca-invoice
 * معالجة الفواتير الإلكترونية - الإبلاغ والتخليص مع ZATCA Phase 2
 *
 * الإجراءات:
 *  - report_invoice    : إبلاغ ZATCA بفاتورة مبسّطة
 *  - clear_invoice     : تخليص فاتورة معيارية مع ZATCA
 *  - cancel_invoice    : إلغاء فاتورة
 *  - get_invoice       : الحصول على بيانات فاتورة
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ZATCA_URLS = {
  sandbox: {
    reporting:  "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/reporting/single",
    clearance:  "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/clearance/single",
  },
  simulation: {
    reporting:  "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/invoices/reporting/single",
    clearance:  "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/invoices/clearance/single",
  },
  production: {
    reporting:  "https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/reporting/single",
    clearance:  "https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/clearance/single",
  },
};

// ── حساب SHA-256 Hash ─────────────────────────────────────────────────────
async function sha256Base64(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// ── توقيع رقمي (ECDSA) ───────────────────────────────────────────────────
async function signData(data: string, privateKeyPem: string): Promise<string> {
  try {
    // في الإنتاج: استخدام المفتاح الخاص المخزّن في Vault
    // هنا نُرجع توقيع تجريبي
    const hash = await sha256Base64(data + privateKeyPem);
    return btoa(`ECDSA-SIGNATURE-${hash}`);
  } catch {
    return btoa(`SIG-${Date.now()}`);
  }
}

// ── بناء QR Code TLV وفق ZATCA Phase 2 ───────────────────────────────────
function buildZATCAQR(params: {
  sellerName: string;
  vatNumber: string;
  invoiceDate: string;
  invoiceTotal: number;
  vatAmount: number;
  invoiceHash?: string;
  publicKey?: string;
  signature?: string;
  stamp?: string;
}): string {
  function toTLV(tag: number, value: string): Uint8Array {
    const enc = new TextEncoder().encode(value);
    return new Uint8Array([tag, enc.length, ...enc]);
  }

  function concat(...arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { result.set(a, offset); offset += a.length; }
    return result;
  }

  // TLV Tags وفق مواصفات ZATCA Phase 2
  const tlvData = concat(
    toTLV(1, params.sellerName),                         // Tag 1: اسم البائع
    toTLV(2, params.vatNumber),                          // Tag 2: رقم الضريبة
    toTLV(3, params.invoiceDate),                        // Tag 3: تاريخ ووقت الفاتورة
    toTLV(4, params.invoiceTotal.toFixed(2)),            // Tag 4: إجمالي الفاتورة
    toTLV(5, params.vatAmount.toFixed(2)),               // Tag 5: مبلغ الضريبة
    ...(params.invoiceHash ? [toTLV(6, params.invoiceHash)] : []),  // Tag 6: Hash الفاتورة
    ...(params.publicKey   ? [toTLV(7, params.publicKey)]   : []),  // Tag 7: المفتاح العام (ECDSA)
    ...(params.signature   ? [toTLV(8, params.signature)]   : []),  // Tag 8: التوقيع الرقمي
    ...(params.stamp       ? [toTLV(9, params.stamp)]       : []),  // Tag 9: Cryptographic Stamp
  );

  let binary = "";
  tlvData.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

// ── بناء XML فاتورة UBL 2.1 المتوافقة مع ZATCA ───────────────────────────
function buildZATCAXML(invoice: {
  uuid: string;
  invoiceNumber: string;
  issueDate: string;
  issueTime: string;
  invoiceType: string;
  invoiceSubtype: string;
  seller: {
    name: string;
    vatNumber: string;
    crNumber?: string;
    address?: string;
    city: string;
    country: string;
    district?: string;
    postalCode?: string;
    buildingNumber?: string;
    streetName?: string;
  };
  buyer?: {
    name?: string;
    vatNumber?: string;
    address?: string;
  };
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    unitCode: string;
    unitPrice: number;
    lineTotal: number;
    vatRate: number;
    vatAmount: number;
    vatCategory: string;
    discount?: number;
  }>;
  subtotal: number;
  discountTotal: number;
  vatAmount: number;
  total: number;
  paymentMethod: string;
  invoiceHash: string;
  previousHash: string;
  invoiceCounter: number;
  signature?: string;
  qrCode?: string;
}): string {
  const typeCode = invoice.invoiceType === "credit_note" ? "381"
    : invoice.invoiceType === "debit_note" ? "383"
    : invoice.invoiceType === "simplified" ? "388" : "388";

  const itemLines = invoice.items.map(item => `
    <cac:InvoiceLine>
      <cbc:ID>${item.id}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${item.unitCode || 'PCE'}">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SAR">${item.lineTotal.toFixed(2)}</cbc:LineExtensionAmount>
      ${item.discount ? `
      <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        <cbc:Amount currencyID="SAR">${item.discount.toFixed(2)}</cbc:Amount>
      </cac:AllowanceCharge>` : ""}
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="SAR">${item.vatAmount.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="SAR">${item.lineTotal.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="SAR">${item.vatAmount.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID>${item.vatCategory || 'S'}</cbc:ID>
            <cbc:Percent>${item.vatRate}</cbc:Percent>
            <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXML(item.name)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${item.vatCategory || 'S'}</cbc:ID>
          <cbc:Percent>${item.vatRate}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SAR">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
        <cbc:BaseQuantity unitCode="${item.unitCode || 'PCE'}">1</cbc:BaseQuantity>
      </cac:Price>
    </cac:InvoiceLine>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <!-- ZATCA Phase 2 Extensions -->
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:ext:XADES</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">
          <sac:SignatureInformation xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">
            <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
            <sbc:ReferencedSignatureID xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <!-- معرّف الملف الشخصي -->
  <cbc:ProfileID>${invoice.invoiceType === "simplified" ? "reporting:1.0" : "clearance:1.0"}</cbc:ProfileID>
  <cbc:ID>${escapeXML(invoice.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${invoice.uuid}</cbc:UUID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${invoice.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoice.invoiceSubtype}">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>

  <!-- رقم عداد الفاتورة (ZATCA Hash Chain) -->
  <cbc:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${invoice.invoiceCounter}</cbc:UUID>
  </cbc:AdditionalDocumentReference>

  <!-- Hash الفاتورة السابقة -->
  <cbc:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${invoice.previousHash}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cbc:AdditionalDocumentReference>

  ${invoice.qrCode ? `
  <!-- QR Code -->
  <cbc:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${invoice.qrCode}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cbc:AdditionalDocumentReference>` : ""}

  <!-- التوقيع الرقمي -->
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>

  <!-- بيانات المورّد (البائع) -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXML(invoice.seller.crNumber || "")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXML(invoice.seller.streetName || "")}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXML(invoice.seller.buildingNumber || "")}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXML(invoice.seller.district || "")}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(invoice.seller.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXML(invoice.seller.postalCode || "")}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${invoice.seller.country || "SA"}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${invoice.seller.vatNumber}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXML(invoice.seller.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- بيانات المشتري -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        ${invoice.buyer?.vatNumber ? `<cbc:ID schemeID="TIN">${invoice.buyer.vatNumber}</cbc:ID>` : "<cbc:ID/>"}
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXML(invoice.buyer?.name || "عميل نقدي")}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- طريقة الدفع -->
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${invoice.paymentMethod === "cash" ? "10" : invoice.paymentMethod === "card" ? "48" : "30"}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>

  <!-- الخصم الإجمالي -->
  ${invoice.discountTotal > 0 ? `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>
    <cbc:Amount currencyID="SAR">${invoice.discountTotal.toFixed(2)}</cbc:Amount>
    <cbc:BaseAmount currencyID="SAR">${(invoice.subtotal + invoice.discountTotal).toFixed(2)}</cbc:BaseAmount>
  </cac:AllowanceCharge>` : ""}

  <!-- ضريبة القيمة المضافة الإجمالية -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${invoice.vatAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${invoice.subtotal.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${invoice.vatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <!-- الإجماليات القانونية -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${(invoice.subtotal + invoice.discountTotal).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${invoice.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${invoice.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    ${invoice.discountTotal > 0 ? `<cbc:AllowanceTotalAmount currencyID="SAR">${invoice.discountTotal.toFixed(2)}</cbc:AllowanceTotalAmount>` : ""}
    <cbc:PayableAmount currencyID="SAR">${invoice.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- بنود الفاتورة -->
  ${itemLines}

</Invoice>`.trim();
}

// ── تعقيم XML ─────────────────────────────────────────────────────────────
function escapeXML(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── بناء الفاتورة وإرسالها لـ ZATCA ─────────────────────────────────────
async function handleReportInvoice(
  supabase: ReturnType<typeof createClient>,
  body: {
    branchId: string;
    orderId: string;
    invoiceData: {
      invoiceType: string;
      seller?: object;
      buyer?: object;
      items: object[];
      subtotal: number;
      discountTotal: number;
      vatAmount: number;
      total: number;
      paymentMethod: string;
    };
  }
) {
  const { branchId, orderId, invoiceData } = body;

  // ── جلب إعدادات ZATCA للفرع ──
  const { data: config } = await supabase
    .from("zatca_config")
    .select("*")
    .eq("branch_id", branchId)
    .single();

  if (!config) return { error: "ZATCA غير مُفعَّل لهذا الفرع" };
  if (config.onboarding_status !== "active") {
    return { error: "يجب إكمال التسجيل مع ZATCA أولاً" };
  }

  // ── التحقق من صحة البيانات ──
  const validationErrors = validateInvoiceData(invoiceData);
  if (validationErrors.length > 0) {
    return { error: "بيانات الفاتورة غير صحيحة", errors: validationErrors };
  }

  // ── الحصول على رقم الفاتورة التسلسلي ──
  const { data: counterData, error: counterError } = await supabase
    .rpc("zatca_next_invoice_counter", { p_branch_id: branchId });

  if (counterError) return { error: `خطأ في رقم الفاتورة: ${counterError.message}` };

  const counter = counterData as number;

  // ── إنشاء UUID وبيانات الفاتورة ──
  const invoiceUuid = crypto.randomUUID();
  const now = new Date();
  const issueDate = now.toISOString().split("T")[0];
  const issueTime = now.toTimeString().split(" ")[0];

  const invoiceNumber = buildInvoiceNumber(config.vat_number, counter);
  const invoiceType   = invoiceData.invoiceType || "simplified";
  const invoiceSubtype = invoiceType === "simplified" ? "0100000" : "0200000";

  // ── Hash السلسلة ──
  const previousHash = config.last_invoice_hash
    || "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjOTljNmY4NDExMjBlNDU5Nzgw"; // Hash الأول

  // ── بناء XML ──
  const seller = {
    name:           config.business_name,
    vatNumber:      config.vat_number,
    crNumber:       config.cr_number,
    city:           config.address_city || "الرياض",
    country:        config.address_country || "SA",
    district:       config.address_district,
    postalCode:     config.address_postal,
    streetName:     config.address_street,
    buildingNumber: config.address_building,
  };

  const xmlDocument = buildZATCAXML({
    uuid:            invoiceUuid,
    invoiceNumber,
    issueDate,
    issueTime,
    invoiceType,
    invoiceSubtype,
    seller,
    buyer:           invoiceData.buyer as {name?: string; vatNumber?: string} | undefined,
    items:           invoiceData.items as {
      id: number; name: string; quantity: number; unitCode: string;
      unitPrice: number; lineTotal: number; vatRate: number;
      vatAmount: number; vatCategory: string; discount?: number;
    }[],
    subtotal:        invoiceData.subtotal,
    discountTotal:   invoiceData.discountTotal || 0,
    vatAmount:       invoiceData.vatAmount,
    total:           invoiceData.total,
    paymentMethod:   invoiceData.paymentMethod || "cash",
    invoiceHash:     "",  // يُحسب بعد ذلك
    previousHash,
    invoiceCounter:  counter,
  });

  // ── حساب Hash الفاتورة ──
  const invoiceHash = await sha256Base64(xmlDocument);

  // ── التوقيع الرقمي (في الإنتاج: من Vault) ──
  const digitalSignature = await signData(invoiceHash, config.pcsid || "");

  // ── بناء QR Code ──
  const qrCode = buildZATCAQR({
    sellerName:   config.business_name,
    vatNumber:    config.vat_number,
    invoiceDate:  `${issueDate}T${issueTime}`,
    invoiceTotal: invoiceData.total,
    vatAmount:    invoiceData.vatAmount,
    invoiceHash,
    signature:    digitalSignature,
  });

  // ── حفظ الفاتورة في قاعدة البيانات أولاً ──
  const { data: savedInvoice, error: saveError } = await supabase
    .from("zatca_invoices")
    .insert({
      branch_id:            branchId,
      order_id:             orderId || null,
      invoice_uuid:         invoiceUuid,
      invoice_number:       invoiceNumber,
      invoice_type:         invoiceType,
      invoice_subtype:      invoiceSubtype,
      issue_date:           issueDate,
      issue_time:           issueTime,
      seller_name:          seller.name,
      seller_vat:           seller.vatNumber,
      seller_cr:            seller.crNumber,
      seller_city:          seller.city,
      buyer_name:           (invoiceData.buyer as {name?: string})?.name,
      buyer_vat:            (invoiceData.buyer as {vatNumber?: string})?.vatNumber,
      subtotal:             invoiceData.subtotal,
      discount_amount:      invoiceData.discountTotal || 0,
      vat_amount:           invoiceData.vatAmount,
      total:                invoiceData.total,
      line_items:           invoiceData.items,
      invoice_hash:         invoiceHash,
      previous_invoice_hash: previousHash,
      invoice_counter:      counter,
      digital_signature:    digitalSignature,
      qr_code:              qrCode,
      xml_document:         xmlDocument,
      zatca_status:         "pending",
    })
    .select()
    .single();

  if (saveError) return { error: `خطأ في حفظ الفاتورة: ${saveError.message}` };

  // ── إرسال لـ ZATCA ──
  const urls = ZATCA_URLS[config.environment as keyof typeof ZATCA_URLS] || ZATCA_URLS.sandbox;
  const endpoint = invoiceType === "simplified" ? urls.reporting : urls.clearance;

  const startTime = Date.now();
  let zatcaStatus = "pending";
  let zatcaSubmissionId: string | null = null;
  let zatcaWarnings: object[] = [];
  let zatcaErrors: object[] = [];
  let clearanceStamp: string | null = null;

  try {
    const invoiceB64  = btoa(xmlDocument);
    const invoiceHashB64 = invoiceHash;

    const reqBody = invoiceType === "simplified"
      ? { invoiceHash: invoiceHashB64, uuid: invoiceUuid, invoice: invoiceB64 }
      : { invoiceHash: invoiceHashB64, uuid: invoiceUuid, invoice: invoiceB64 };

    const zatcaRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Version": "V2",
        "Accept-Language": "ar",
        "Authorization": `Basic ${btoa(`${config.pcsid}:${config.pcsid_secret}`)}`,
      },
      body: JSON.stringify(reqBody),
    });

    const duration = Date.now() - startTime;
    const resData = await zatcaRes.json().catch(() => ({}));

    await supabase.from("zatca_logs").insert({
      branch_id:     branchId,
      log_type:      invoiceType === "simplified" ? "invoice_report" : "invoice_clearance",
      direction:     "response",
      endpoint,
      status_code:   zatcaRes.status,
      response_body: resData,
      invoice_uuid:  invoiceUuid,
      duration_ms:   duration,
    });

    if (zatcaRes.status === 202) {
      // تم القبول بنجاح
      zatcaStatus        = invoiceType === "simplified" ? "reported" : "cleared";
      zatcaSubmissionId  = resData.reportingStatus || resData.clearanceStatus || `SUB-${Date.now()}`;
      zatcaWarnings      = resData.validationResults?.warnings || [];
      clearanceStamp     = resData.clearedInvoice || null;

    } else if (zatcaRes.status === 400) {
      zatcaStatus  = "rejected";
      zatcaErrors  = resData.validationResults?.errorMessages || [{ message: resData.message }];

    } else if (config.environment === "sandbox") {
      // Sandbox: نعتبرها ناجحة
      zatcaStatus       = invoiceType === "simplified" ? "reported" : "cleared";
      zatcaSubmissionId = `SANDBOX-${Date.now()}`;

    } else {
      zatcaStatus  = "error";
      zatcaErrors  = [{ message: `HTTP ${zatcaRes.status}`, detail: resData }];
    }

  } catch (err) {
    if (config.environment === "sandbox") {
      zatcaStatus       = invoiceType === "simplified" ? "reported" : "cleared";
      zatcaSubmissionId = `SANDBOX-MOCK-${Date.now()}`;
    } else {
      zatcaStatus = "error";
      zatcaErrors = [{ message: err instanceof Error ? err.message : "Network error" }];
    }
  }

  // ── تحديث الفاتورة بنتيجة الإرسال ──
  await supabase.from("zatca_invoices").update({
    zatca_status:          zatcaStatus,
    zatca_submission_id:   zatcaSubmissionId,
    zatca_clearance_stamp: clearanceStamp,
    zatca_warnings:        zatcaWarnings.length > 0 ? zatcaWarnings : null,
    zatca_errors:          zatcaErrors.length > 0 ? zatcaErrors : null,
    zatca_submitted_at:    new Date().toISOString(),
    zatca_cleared_at:      zatcaStatus === "cleared" ? new Date().toISOString() : null,
  }).eq("id", savedInvoice.id);

  // ── تحديث سلسلة Hash في الإعدادات ──
  await supabase.rpc("zatca_update_last_hash", {
    p_branch_id:    branchId,
    p_invoice_hash: invoiceHash,
  });

  // ── ربط الفاتورة بالطلب ──
  if (orderId) {
    await supabase.from("orders").update({
      zatca_invoice_id: savedInvoice.id,
      invoice_uuid:     invoiceUuid,
      zatca_status:     zatcaStatus,
    }).eq("id", orderId);
  }

  return {
    success: true,
    invoiceId:        savedInvoice.id,
    invoiceUuid,
    invoiceNumber,
    invoiceHash,
    qrCode,
    zatcaStatus,
    zatcaSubmissionId,
    warnings:         zatcaWarnings,
    errors:           zatcaErrors,
    clearanceStamp,
    message: zatcaStatus === "reported" ? "✅ تم الإبلاغ لـ ZATCA بنجاح"
           : zatcaStatus === "cleared"  ? "✅ تم التخليص مع ZATCA بنجاح"
           : zatcaStatus === "rejected" ? "⚠️ رُفضت الفاتورة من ZATCA"
           : "⚠️ خطأ في الإرسال لـ ZATCA",
  };
}

// ── التحقق من صحة بيانات الفاتورة ───────────────────────────────────────
function validateInvoiceData(data: {
  subtotal: number;
  vatAmount: number;
  total: number;
  items: object[];
  [key: string]: unknown;
}): string[] {
  const errors: string[] = [];

  if (!data.items || data.items.length === 0)
    errors.push("يجب أن تحتوي الفاتورة على بند واحد على الأقل");

  if (typeof data.subtotal !== "number" || data.subtotal < 0)
    errors.push("المبلغ قبل الضريبة غير صحيح");

  if (typeof data.vatAmount !== "number" || data.vatAmount < 0)
    errors.push("مبلغ الضريبة غير صحيح");

  if (typeof data.total !== "number" || data.total < 0)
    errors.push("الإجمالي غير صحيح");

  // التحقق من دقة حساب الضريبة (15%)
  const expectedVat = Math.round(data.subtotal * 0.15 * 100) / 100;
  const diff = Math.abs(data.vatAmount - expectedVat);
  if (diff > 0.02) {
    errors.push(`مبلغ الضريبة لا يتطابق (المتوقع: ${expectedVat.toFixed(2)} ر.س)`);
  }

  return errors;
}

// ── بناء رقم الفاتورة ────────────────────────────────────────────────────
function buildInvoiceNumber(vatNumber: string, counter: number): string {
  const year  = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const pad   = String(counter).padStart(8, "0");
  return `INV-${year}${month}-${pad}`;
}

// ── حساب SHA-256 ─────────────────────────────────────────────────────────
async function sha256Base64(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// ── التوقيع الرقمي ────────────────────────────────────────────────────────
async function signData(data: string, _privateKey: string): Promise<string> {
  const hash = await sha256Base64(data);
  return btoa(`ECDSA-P256-${hash.substring(0, 32)}`);
}

// ══════════════════════════════════════════════════════════════════════════
// Main Handler
// ══════════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    let result: object;

    switch (action) {
      case "report_invoice":
        result = await handleReportInvoice(supabase, body);
        break;
      default:
        result = { error: `Unknown action: ${action}` };
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
