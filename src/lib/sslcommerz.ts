/**
 * SSLCommerz Payment Gateway Integration Utilities
 *
 * Flow:
 * 1. `initializePayment()` posts URL-encoded form parameters to SSLCommerz's
 *    session API and returns a hosted `GatewayPageURL`.
 * 2. After checkout, SSLCommerz redirects the user (with `val_id` & `tran_id`)
 *    and/or sends a server-to-server IPN webhook.
 * 3. `validatePayment(val_id)` performs a trusted server-to-server call to
 *    SSLCommerz's validation API before any orders are created in PostgreSQL.
 */

const STORE_ID = process.env.SSL_COMMERZ_STORE_ID;
const STORE_PASSWORD = process.env.SSL_COMMERZ_STORE_PASSWORD;
const API_URL =
  process.env.SSL_COMMERZ_API_URL ||
  "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
const VALIDATION_URL =
  process.env.SSL_COMMERZ_VALIDATION_URL ||
  "https://sandbox.sslcommerz.com/validator/api/validationApi.php";

export interface SSLCommerzInitParams {
  total_amount: number;
  currency: string;
  tran_id: string;
  success_url: string;
  fail_url: string;
  cancel_url: string;
  ipn_url: string;
  cus_name: string;
  cus_email: string;
  cus_phone: string;
  product_name: string;
  product_category: string;
}

export interface SSLCommerzInitResponse {
  status: string;
  GatewayPageURL?: string;
  failedreason?: string;
  [key: string]: unknown;
}

/**
 * Generates collision-resistant transaction IDs in `TXN-<epoch>-<rand>` format.
 */
export function generateTransactionId(): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return `TXN-${Date.now()}-${rand}`;
}

/**
 * Initializes a checkout session with SSLCommerz.
 * Note: SSLCommerz expects `application/x-www-form-urlencoded` bodies, NOT JSON.
 */
export async function initializePayment(
  params: SSLCommerzInitParams
): Promise<SSLCommerzInitResponse> {
  if (!STORE_ID || !STORE_PASSWORD) {
    throw new Error(
      "SSLCommerz credentials missing: set SSL_COMMERZ_STORE_ID and SSL_COMMERZ_STORE_PASSWORD"
    );
  }

  const formData = new URLSearchParams();
  formData.append("store_id", STORE_ID);
  formData.append("store_passwd", STORE_PASSWORD);
  formData.append("total_amount", params.total_amount.toString());
  formData.append("currency", params.currency);
  formData.append("tran_id", params.tran_id);
  formData.append("success_url", params.success_url);
  formData.append("fail_url", params.fail_url);
  formData.append("cancel_url", params.cancel_url);
  formData.append("ipn_url", params.ipn_url);
  formData.append("cus_name", params.cus_name);
  formData.append("cus_email", params.cus_email);
  formData.append("cus_phone", params.cus_phone);
  formData.append("product_name", params.product_name);
  formData.append("product_category", params.product_category);

  const response = await fetch(API_URL, {
    method: "POST",
    body: formData,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`SSLCommerz HTTP ${response.status}: ${responseText}`);
  }

  // SSLCommerz usually returns JSON, but older/error responses can be URL-encoded
  // query strings (`status=FAILED&failedreason=...`), so we fall back gracefully.
  try {
    return JSON.parse(responseText) as SSLCommerzInitResponse;
  } catch {
    const parsed: Record<string, string> = {};
    for (const pair of responseText.split("&")) {
      const [key, value] = pair.split("=");
      if (key) {
        parsed[decodeURIComponent(key)] = decodeURIComponent(value || "");
      }
    }
    return parsed as SSLCommerzInitResponse;
  }
}

/**
 * Server-to-server payment validation using the `val_id` returned by SSLCommerz.
 * Never trust client-side query params alone—always verify directly with the gateway.
 */
export async function validatePayment(
  valId: string
): Promise<{ valid: boolean; data?: Record<string, any>; error?: string }> {
  if (!STORE_ID || !STORE_PASSWORD) {
    return { valid: false, error: "SSLCommerz credentials not configured" };
  }

  try {
    // Validation API accepts query parameters or URL-encoded POST data
    const url = new URL(VALIDATION_URL);
    url.searchParams.set("val_id", valId);
    url.searchParams.set("store_id", STORE_ID);
    url.searchParams.set("store_passwd", STORE_PASSWORD);
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      return { valid: false, error: `Validation HTTP ${response.status}` };
    }

    const data = await response.json();
    const status = String(data.status || "").toUpperCase();
    const valid = status === "VALID" || status === "VALIDATED";

    return { valid, data };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Validation request failed",
    };
  }
}

