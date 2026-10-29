// file: src/index.ts
// ZATCA SDK - Public API

// High-level client
export {
    ZATCAClient,
    type SubmissionResult,
    type ZATCAClientOptions,
    type ZATCAClientState,
} from "./lib/client.ts";

// EGS device management + signing pipeline
export {
    EGS,
    computeInvoiceHash,
    generateOnboardingKeys,
    requestComplianceCertificate,
    requestProductionCertificate,
    signInvoice,
    validateCredentials,
    validateInvoice,
    type EGSCredentials,
    type EGSState,
    type KeysAndCSR,
    type SignedInvoice,
    type SignerConfig,
    type SignerCredentials,
} from "./lib/egs/index.ts";

// Low-level API access
export { ZATCAAPIClient, createAPIClient, type APIClientConfig } from "./lib/api/client.ts";
export { checkInvoiceCompliance, issueComplianceCSID, type ComplianceCheckResponse } from "./lib/api/compliance.ts";
export { issueProductionCSID } from "./lib/api/production.ts";
export { clearInvoice } from "./lib/api/clearance.ts";
export { reportInvoice } from "./lib/api/reporting.ts";
export { renewProductionCSID } from "./lib/api/renewal.ts";

// Crypto utilities
export {
    CSR_TEMPLATE_NAMES,
    INITIAL_PREVIOUS_HASH,
    TLV_TAGS,
    decodeTLVString,
    derivePublicKey,
    formatAmount,
    formatQrTimestamp,
    generateCSR,
    generateKeyPair,
    generateQRBuffer,
    generateQRDataURL,
    generateQRSVG,
    generateTLVString,
    hashInvoiceXML,
    needsRenewal,
    normalizeCertificate,
    parseCertificate,
    parsePrivateKey,
    sha256,
    sha256Hex,
    signInvoiceHash,
    tlvEncode,
    validateCertificate,
    verifyInvoiceSignature,
    type CSRInput,
    type CertificateDetails,
    type CertificateValidation,
    type GeneratedCSR,
    type KeyPair,
    type NormalizedCertificate,
    type QROptions,
} from "./lib/crypto/index.ts";

export { formatMoney, formatQuantity } from "./lib/money.ts";

// XML utilities
export { QR_PLACEHOLDER, buildInvoiceXml, replaceQrPlaceholder } from "./lib/xml/builder.ts";
export {
    canonicalizeForSigning,
    computeInvoiceHash as computeInvoiceHashFromXml,
    parseXML,
} from "./lib/xml/canonicalize.ts";
export {
    computeSignedPropertiesHash,
    createUBLExtensions,
    defaultSigningTime,
    insertUBLExtensions,
    type XAdESConfig,
    type XAdESResult,
} from "./lib/xml/xades.ts";
export { XML_NAMESPACES, XML_NS_DECLARATIONS } from "./lib/xml/namespaces.ts";

// Types
export {
    SIMPLIFIED_INVOICE,
    STANDARD_INVOICE,
    ZATCA_URLS,
    type ClearanceResponse,
    type ComplianceCSID,
    type DocumentAllowance,
    type EGSUnitInfo,
    type Invoice,
    type InvoiceLine,
    type InvoiceParty,
    type InvoiceRequest,
    type InvoiceSubType,
    type InvoiceTypeCode,
    type PartyAddress,
    type PartyIdentification,
    type ProductionCSID,
    type ReportingResponse,
    type Result,
    type SignedInvoiceData,
    type TaxSubtotal,
    type VATCategory,
    type ValidationMessage,
    type ValidationResults,
    type ZATCAEnvironment,
} from "./lib/types.ts";

// Errors
export {
    APIError,
    CSRError,
    CertificateError,
    ConfigurationError,
    SigningError,
    ValidationError,
    XMLError,
    XMLProcessingError,
    ZATCAError,
} from "./lib/errors.ts";
