import type { CoinflowCurrencyCents, GetCustomerResponse } from "./types";

const parseError = async (response: Response): Promise<string> => {
  const maybeJson = await response.json().catch(() => null);
  if (maybeJson?.message) return String(maybeJson.message);
  if (maybeJson?.error) return String(maybeJson.error);
  return `Request failed with status ${response.status}`;
};

const buildJsonHeaders = (extra?: Record<string, string>) => ({
  accept: "application/json",
  "content-type": "application/json",
  ...extra,
});

const buildCoinflowAuthHeaders = ({
  walletAddress,
  authBlockchain,
}: {
  walletAddress: string;
  authBlockchain: string;
}) =>
  buildJsonHeaders({
    "x-coinflow-auth-wallet": walletAddress,
    "x-coinflow-auth-blockchain": authBlockchain,
  });

export const fetchCoinflowCustomer = async ({
  apiBaseUrl,
  walletAddress,
  authBlockchain,
  signal,
}: {
  apiBaseUrl: string;
  walletAddress: string;
  authBlockchain: string;
  signal?: AbortSignal;
}): Promise<GetCustomerResponse> => {
  if (!walletAddress) {
    throw new Error("Missing user identity for Coinflow customer.");
  }

  const headers = buildCoinflowAuthHeaders({
    walletAddress,
    authBlockchain,
  });

  const response = await fetch(`${apiBaseUrl}/api/customer/v2`, {
    method: "GET",
    headers,
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json().catch(() => ({}));
  if (!data || typeof data !== "object") {
    return { customer: null };
  }

  return data as GetCustomerResponse;
};

export const fetchCoinflowTotals = async ({
  apiBaseUrl,
  merchantId,
  walletAddress,
  authBlockchain,
  subtotal,
}: {
  apiBaseUrl: string;
  merchantId: string;
  walletAddress: string;
  authBlockchain: string;
  subtotal: CoinflowCurrencyCents;
}): Promise<unknown> => {
  if (!walletAddress) {
    throw new Error("Missing user identity for Coinflow totals.");
  }

  const headers = buildCoinflowAuthHeaders({
    walletAddress,
    authBlockchain,
  });

  const response = await fetch(
    `${apiBaseUrl}/api/checkout/totals/${merchantId}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ subtotal }),
    }
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json().catch(() => ({}));
};

export const createCoinflowCardCheckout = async ({
  apiBaseUrl,
  merchantId,
  walletAddress,
  authBlockchain,
  payload,
}: {
  apiBaseUrl: string;
  merchantId: string;
  walletAddress: string;
  authBlockchain: string;
  payload: object;
}): Promise<unknown> => {
  if (!walletAddress) {
    throw new Error("Missing user identity for Coinflow card checkout.");
  }

  const headers = buildCoinflowAuthHeaders({
    walletAddress,
    authBlockchain,
  });

  const response = await fetch(`${apiBaseUrl}/api/checkout/card/${merchantId}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json().catch(() => ({}));
};

export const createCoinflowTokenCheckout = async ({
  apiBaseUrl,
  merchantId,
  walletAddress,
  authBlockchain,
  payload,
  signal,
}: {
  apiBaseUrl: string;
  merchantId: string;
  walletAddress: string;
  authBlockchain: string;
  payload: object;
  signal?: AbortSignal;
}): Promise<unknown> => {
  if (!walletAddress) {
    throw new Error("Missing user identity for Coinflow token checkout.");
  }

  const headers = buildCoinflowAuthHeaders({
    walletAddress,
    authBlockchain,
  });

  const response = await fetch(
    `${apiBaseUrl}/api/checkout/token/${merchantId}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json().catch(() => ({}));
};
