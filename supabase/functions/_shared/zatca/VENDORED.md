# zatca-sdk (vendored)

- Source: https://github.com/aashahin/zatca-sdk — commit `7ed29640512e158e12ca623c9841a46a3962f710` (v0.1.2), MIT (see LICENSE).
- Why vendored: Supabase Edge runs Deno; we pin the exact code we verified.

## Felsy patches (keep when updating)
1. Deno compatibility: explicit `.ts` import paths, `npm:`/`node:` specifiers, `import { Buffer } from "node:buffer"`.
2. QR tag 4 = `payableAmount` (amount due, BT-115) instead of `taxInclusiveAmount` — the official validator warns otherwise when a rounding amount exists.
3. `APIClientConfig.baseUrl` optional override — used only by tests against a local mock of the Fatoora API.

## How it was verified (2026-10-29)
- SDK unit tests: 72 pass.
- Official ZATCA validator (zatca-einvoicing-sdk 238-R3.4.8, Java 11): XSD + EN16931 + KSA schematron + QR + signature + PIH = PASSED for
  80 Felsy-shaped simplified invoices (0 warnings), a 4-document chain (invoice, invoice, credit note 381, standard B2B), and a Deno-signed invoice.
- Negative controls: tampered amount ⇒ QR+SIGNATURE FAILED; broken PIH chain ⇒ PIH FAILED.
- CSR generated under Deno verified by `openssl req -verify` (secp256k1, ZATCA-Code-Signing template, SAN DirName fields).
- NOT verified here: live calls to gw-fatoora.zatca.gov.sa (blocked from the build machine) — run the sandbox self-test from Settings → ZATCA.
