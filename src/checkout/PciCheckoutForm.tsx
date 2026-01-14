import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HTMLInputTypeAttribute } from "react";
import {
  CardType,
  CoinflowCardNumberInput,
  CoinflowCvvInput,
  CoinflowCvvOnlyInput,
} from "@coinflowlabs/react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "../wallet/Wallet";

// Getting unauthorized on Checkout API, so using my own sandbox merchant ID for now
// const MERCHANT_ID = "swe-challenge";
const MERCHANT_ID = "sandbox-merchant-id-peter-ryszkiewicz";
const SANDBOX_API_KEY = import.meta.env.VITE_SANDBOX_API_KEY as string | undefined;

type CardTokenResponse = {
  token: string;
  cardType?: string;
  firstSix?: string;
  lastFour?: string;
};

type SavedCard = {
  token: string;
  cardType: CardType;
  firstSix?: string;
  lastFour?: string;
};

type CurrencyCents = {
  currency: string;
  cents: number;
};

const parseString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const extractSavedCardEntries = (
  record: Record<string, unknown>
): unknown[] | null => {
  const candidates = [
    record.cards,
    record.cardTokens,
    record.paymentMethods,
    record.payment_methods,
    record.savedCards,
    record.saved_cards,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
};

const parseCurrencyCents = (value: unknown): CurrencyCents | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as { cents?: unknown; currency?: unknown };
  if (typeof record.cents !== "number") return null;
  if (typeof record.currency !== "string") return null;
  return { cents: record.cents, currency: record.currency };
};

const parseTotalsResponse = (
  value: unknown
): { subtotal?: CurrencyCents; total?: CurrencyCents } => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    subtotal: parseCurrencyCents(record.subtotal) ?? undefined,
    total: parseCurrencyCents(record.total) ?? undefined,
  };
};

export function PciCheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const { user } = usePrivy();
  const { wallet, ready } = useWallet();
  const cardInputRef = useRef<{ getToken: () => Promise<CardTokenResponse> }>(
    null
  );
  const savedCardInputRef = useRef<{ getToken: () => Promise<CardTokenResponse> }>(
    null
  );
  const [isCardSubmitting, setIsCardSubmitting] = useState(false);
  const [isSavedSubmitting, setIsSavedSubmitting] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [cardSuccess, setCardSuccess] = useState<string | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<"new" | "saved">("new");
  const [subtotal, setSubtotal] = useState<CurrencyCents | null>(null);
  const [total, setTotal] = useState<CurrencyCents | null>(null);
  const [isTotalsLoading, setIsTotalsLoading] = useState(false);
  const [totalsError, setTotalsError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [sessionKeyError, setSessionKeyError] = useState<string | null>(null);
  const [isSessionKeyLoading, setIsSessionKeyLoading] = useState(false);
  const [isSavedCardLoading, setIsSavedCardLoading] = useState(false);
  const [formState, setFormState] = useState({
    expMonth: "05",
    expYear: "27",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    address1: "123 Market St",
    city: "San Francisco",
    state: "CA",
    zip: "94107",
    country: "US",
  });

  const origins = ["http://localhost:5173"];

  const baseSubtotal = useMemo(() => ({ currency: "USD", cents: 20_00 }), []);
  const resolvedSubtotal = useMemo(
    () => subtotal ?? baseSubtotal,
    [baseSubtotal, subtotal]
  );
  const displayAmount = useMemo(
    () => total ?? resolvedSubtotal,
    [resolvedSubtotal, total]
  );
  const coinflowEnv = "sandbox";
  const merchantId = MERCHANT_ID;
  const apiBaseUrl = "https://api-sandbox.coinflow.cash";
  const apiKey = SANDBOX_API_KEY;
  const checkoutAuthKey = sessionKey ?? apiKey ?? null;
  const isCheckoutReady = Boolean(checkoutAuthKey) && !isSessionKeyLoading;
  const savedCheckoutTimeoutMs = 8000;
  const buildHeaders = useCallback(
    (extra?: Record<string, string>) => {
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
        ...extra,
      };

      if (checkoutAuthKey) {
        headers["x-coinflow-auth-session-key"] = checkoutAuthKey;
      }

      return headers;
    },
    [checkoutAuthKey]
  );

  const logError = useCallback((context: string, error: unknown) => {
    console.error(`[PciCheckoutForm] ${context}`, error);
  }, []);

  const logSuccess = useCallback((context: string, payload?: unknown) => {
    if (payload === undefined) {
      console.log(`[PciCheckoutForm] ${context}`);
      return;
    }

    console.log(`[PciCheckoutForm] ${context}`, payload);
  }, []);

  const getUserIdentifier = useCallback(() => {
    const maybeEmail =
      (user as { email?: { address?: string } } | null)?.email?.address ?? null;
    if (maybeEmail) return maybeEmail;
    return user?.id ?? null;
  }, [user]);

  const inputStyles = useMemo(
    () => ({
      base: 'font-family: "Red Hat Display", sans-serif;padding: 0 12px;border: 1px solid rgba(0, 0, 0, 0.15);margin: 0;width: 100%;font-size: 13px;line-height: 36px;height: 40px;box-sizing: border-box;-moz-box-sizing: border-box;border-radius: 12px;',
      focus:
        "box-shadow: 0 0 6px 0 rgba(59, 130, 246, 0.5);border: 1px solid rgba(59, 130, 246, 0.6);outline: 0;",
      error:
        "box-shadow: 0 0 6px 0 rgba(224, 57, 57, 0.5);border: 1px solid rgba(224, 57, 57, 0.5);",
      cvv: {
        base: 'font-family: "Red Hat Display", sans-serif;padding: 0 12px;border: 1px solid rgba(0, 0, 0, 0.15);margin: 0;width: 100%;font-size: 13px;line-height: 36px;height: 40px;box-sizing: border-box;-moz-box-sizing: border-box;border-radius: 12px;',
        focus:
          "box-shadow: 0 0 6px 0 rgba(59, 130, 246, 0.5);border: 1px solid rgba(59, 130, 246, 0.6);outline: 0;",
        error:
          "box-shadow: 0 0 6px 0 rgba(224, 57, 57, 0.5);border: 1px solid rgba(224, 57, 57, 0.5);",
      },
    }),
    []
  );

  const updateFormState = useCallback(
    (key: keyof typeof formState, value: string) => {
      setFormState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const validateCardForm = useCallback(() => {
    const missingFields = Object.entries(formState)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    if (missingFields.length === 0) {
      return null;
    }

    return `Missing required fields: ${missingFields.join(", ")}`;
  }, [formState]);

  const normalizeCardType = useCallback((value?: string | null) => {
    if (!value) return null;
    const upper = value.toUpperCase();
    if (upper === "VISA") return CardType.VISA;
    if (upper === "MASTER" || upper === "MASTERCARD" || upper === "MSTR") {
      return CardType.MASTERCARD;
    }
    if (upper === "AMEX" || upper === "AMERICANEXPRESS") {
      return CardType.AMEX;
    }
    if (upper === "DISC" || upper === "DISCOVER") return CardType.DISCOVER;
    return null;
  }, []);

  const parseSavedCardEntry = useCallback(
    (value: unknown): SavedCard | null => {
      if (!value || typeof value !== "object") return null;
      const record = value as Record<string, unknown>;
      const token = parseString(
        record.token ?? record.cardToken ?? record.card_token
      );
      if (!token) return null;

      const cardTypeValue = parseString(
        record.cardType ?? record.type ?? record.brand ?? record.network
      );
      const cardType = normalizeCardType(cardTypeValue);
      if (!cardType) return null;

      const firstSix = parseString(
        record.firstSix ??
          record.first_six ??
          record.first6 ??
          record.bin ??
          record.binNumber
      );
      const lastFour = parseString(
        record.lastFour ??
          record.last_four ??
          record.last4 ??
          record.lastDigits ??
          record.last_digits
      );
      return {
        token,
        cardType,
        firstSix: firstSix ?? undefined,
        lastFour: lastFour ?? undefined,
      };
    },
    [normalizeCardType]
  );

  const parseSavedCardResponse = useCallback(
    (value: unknown): SavedCard | null => {
      if (!value || typeof value !== "object") return null;
      const record = value as Record<string, unknown>;
      const customerRecord =
        record.customer && typeof record.customer === "object"
          ? (record.customer as Record<string, unknown>)
          : record;
      const entries = extractSavedCardEntries(customerRecord);
      if (entries) {
        for (const entry of entries) {
          const parsed = parseSavedCardEntry(entry);
          if (parsed) return parsed;
        }
      }

      return parseSavedCardEntry(
        customerRecord.card ??
          customerRecord.paymentMethod ??
          customerRecord.savedCard
      );
    },
    [parseSavedCardEntry]
  );

  const parseError = useCallback(async (response: Response) => {
    const maybeJson = await response.json().catch(() => null);
    if (maybeJson?.message) return maybeJson.message as string;
    if (maybeJson?.error) return maybeJson.error as string;
    return `Request failed with status ${response.status}`;
  }, []);

  const postJson = useCallback(
    async (path: string, payload: object) => {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      return response.json().catch(() => ({}));
    },
    [apiBaseUrl, buildHeaders, parseError]
  );

  const fetchSessionKey = useCallback(async () => {
    if (!ready) return;
    if (sessionKey || isSessionKeyLoading) return;

    setSessionKeyError(null);
    setIsSessionKeyLoading(true);

    const walletAddress = wallet.publicKey?.toString() ?? null;
    const userId = getUserIdentifier();
    if (!walletAddress && !userId) {
      setSessionKeyError("Missing user identity for Coinflow session key.");
      setIsSessionKeyLoading(false);
      return;
    }

    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        Authorization: apiKey ?? "",
      };

      if (walletAddress) {
        headers["x-coinflow-auth-blockchain"] = "solana";
        headers["x-coinflow-auth-wallet"] = walletAddress;
      } else if (userId) {
        headers["x-coinflow-auth-user-id"] = userId;
      }

      const response = await fetch(`${apiBaseUrl}/api/auth/session-key`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const data = (await response.json().catch(() => ({}))) as {
        key?: string;
      };
      if (data.key) {
        setSessionKey(data.key);
        logSuccess("Session key fetched.");
      } else {
        setSessionKeyError("Coinflow session key missing from response.");
      }
    } catch (error) {
      logError("Failed to fetch Coinflow session key.", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch Coinflow session key.";
      setSessionKeyError(message);
    } finally {
      setIsSessionKeyLoading(false);
    }
  }, [
    apiBaseUrl,
    apiKey,
    getUserIdentifier,
    parseError,
    ready,
    wallet.publicKey,
  ]);

  const fetchTotals = useCallback(async () => {
    if (!checkoutAuthKey) {
      setTotalsError(
        "Waiting for Coinflow auth key before loading totals."
      );
      return;
    }

    setIsTotalsLoading(true);
    setTotalsError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/checkout/totals/${merchantId}`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ subtotal: baseSubtotal }),
        }
      );

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const data = await response.json().catch(() => ({}));
      const { subtotal: responseSubtotal, total: responseTotal } =
        parseTotalsResponse(data);
      if (responseSubtotal) setSubtotal(responseSubtotal);
      if (responseTotal) setTotal(responseTotal);
      logSuccess("Totals fetched.", {
        subtotal: responseSubtotal ?? null,
        total: responseTotal ?? null,
      });
    } catch (error) {
      logError("Failed to fetch totals.", error);
      const message =
        error instanceof Error ? error.message : "Failed to fetch totals.";
      setTotalsError(message);
    } finally {
      setIsTotalsLoading(false);
    }
  }, [
    apiBaseUrl,
    baseSubtotal,
    buildHeaders,
    checkoutAuthKey,
    merchantId,
    parseError,
  ]);

  const fetchSavedCard = useCallback(async () => {
    if (!checkoutAuthKey) {
      setSavedError("Waiting for Coinflow auth key before loading saved card.");
      return;
    }

    setIsSavedCardLoading(true);
    setSavedError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/customer/v2`, {
        method: "GET",
        headers: buildHeaders(),
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const data = await response.json().catch(() => ({}));
      const parsedCard = parseSavedCardResponse(data);
      if (parsedCard) {
        setSavedCard(parsedCard);
        logSuccess("Saved card fetched.", {
          token: parsedCard.token,
          cardType: parsedCard.cardType,
        });
      } else {
        setSavedError("No saved card available for this customer.");
      }
    } catch (error) {
      logError("Failed to fetch saved card.", error);
      const message =
        error instanceof Error ? error.message : "Failed to fetch saved card.";
      setSavedError(message);
    } finally {
      setIsSavedCardLoading(false);
    }
  }, [
    apiBaseUrl,
    buildHeaders,
    checkoutAuthKey,
    logError,
    logSuccess,
    parseError,
    parseSavedCardResponse,
  ]);

  useEffect(() => {
    fetchSessionKey().catch((error) => {
      logError("Unhandled session key rejection.", error);
    });
  }, [fetchSessionKey, logError]);

  useEffect(() => {
    if (!checkoutAuthKey) return;
    fetchTotals().catch((error) => {
      logError("Unhandled totals rejection.", error);
    });
  }, [checkoutAuthKey, fetchTotals, logError]);

  useEffect(() => {
    if (checkoutMode !== "saved") return;
    if (savedCard || isSavedCardLoading) return;
    fetchSavedCard().catch((error) => {
      logError("Unhandled saved card rejection.", error);
    });
  }, [checkoutMode, fetchSavedCard, isSavedCardLoading, logError, savedCard]);

  const handleCardCheckout = useCallback(async () => {
    setCardError(null);
    setCardSuccess(null);

    const validationMessage = validateCardForm();
    if (validationMessage) {
      setCardError(validationMessage);
      return;
    }

    if (!cardInputRef.current) {
      setCardError("Card inputs are not ready yet.");
      return;
    }

    setIsCardSubmitting(true);
    try {
      const tokenResponse = await cardInputRef.current.getToken();
      const cardType = normalizeCardType(tokenResponse.cardType);
      const payload = {
        subtotal: resolvedSubtotal,
        card: {
          cardToken: tokenResponse.token,
          expYear: formState.expYear,
          expMonth: formState.expMonth,
          email: formState.email,
          firstName: formState.firstName,
          lastName: formState.lastName,
          address1: formState.address1,
          city: formState.city,
          zip: formState.zip,
          state: formState.state,
          country: formState.country,
        },
      };

      await postJson(`/api/checkout/card/${merchantId}`, payload);
      if (cardType) {
        setSavedCard({
          token: tokenResponse.token,
          cardType,
          firstSix: tokenResponse.firstSix,
          lastFour: tokenResponse.lastFour,
        });
        setCardSuccess("Card checkout succeeded. Saved card is ready.");
      } else {
        setCardSuccess("Card checkout succeeded. Save card unavailable.");
      }
      onSuccess();
    } catch (error) {
      logError("Card checkout failed.", error);
      const message =
        error instanceof Error ? error.message : "Card checkout failed.";
      setCardError(message);
    } finally {
      setIsCardSubmitting(false);
    }
  }, [
    formState,
    merchantId,
    normalizeCardType,
    onSuccess,
    postJson,
    resolvedSubtotal,
    validateCardForm,
  ]);

  const handleSavedCardCheckout = useCallback(async () => {
    setSavedError(null);

    if (!savedCard) {
      setSavedError("No saved card available yet.");
      return;
    }

    if (!savedCardInputRef.current) {
      setSavedError("Saved card input is not ready yet.");
      return;
    }

    setIsSavedSubmitting(true);
    try {
      console.log("getting token...");
      // Hangs here
      const tokenResponse = await savedCardInputRef.current.getToken();
      console.log("tokenResponse: ", tokenResponse);
      if (!tokenResponse?.token) {
        setSavedError("TokenEx did not return a card token. Please retry.");
        return;
      }
      const payload = {
        subtotal: resolvedSubtotal,
        token: tokenResponse.token,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, savedCheckoutTimeoutMs);
      const response = await fetch(`${apiBaseUrl}/api/checkout/token/${merchantId}`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const responseData = await response.json().catch(() => ({}));
      console.log("checkout token response: ", response);
      const updatedSavedCard = parseSavedCardResponse(responseData);
      if (updatedSavedCard) {
        setSavedCard(updatedSavedCard);
      }
      onSuccess();
    } catch (error) {
      logError("Saved card checkout failed.", error);
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Saved card checkout timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "Saved card checkout failed.";
      setSavedError(message);
    } finally {
      setIsSavedSubmitting(false);
    }
  }, [
    apiBaseUrl,
    buildHeaders,
    merchantId,
    onSuccess,
    parseSavedCardResponse,
    parseError,
    savedCard,
    savedCheckoutTimeoutMs,
    resolvedSubtotal,
  ]);

  return (
    <div className="h-full flex-1 w-full pb-20">
      <div className="flex flex-col h-full mx-auto overflow-hidden rounded-none md:rounded-xl md:border border-black/5 bg-white">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">
            PCI Card Checkout
          </h2>
          <p className="text-sm text-slate-500">
            Tokenize card data with Coinflow PCI inputs and call the checkout
            APIs directly.
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="inline-flex rounded-2xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setCheckoutMode("new")}
              className={`rounded-2xl px-4 py-2 transition ${
                checkoutMode === "new"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              New Card
            </button>
            <button
              type="button"
              onClick={() => setCheckoutMode("saved")}
              className={`rounded-2xl px-4 py-2 transition ${
                checkoutMode === "saved"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Saved Card
            </button>
          </div>

          {checkoutMode === "new" ? (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  New Card Checkout
                </h3>
                <p className="text-xs text-slate-500">
                  Amount:{" "}
                  {isTotalsLoading
                    ? "Loading totals..."
                    : `$${(displayAmount.cents / 100).toFixed(2)} ${
                        displayAmount.currency
                      }`}
                </p>
                {isSessionKeyLoading ? (
                  <p className="text-xs text-slate-500">
                    Loading checkout session...
                  </p>
                ) : null}
                {totalsError ? (
                  <p className="text-xs text-red-600">{totalsError}</p>
                ) : null}
                {sessionKeyError ? (
                  <p className="text-xs text-red-600">{sessionKeyError}</p>
                ) : null}
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Card Number
                </label>
                <CoinflowCardNumberInput
                  ref={cardInputRef}
                  env={coinflowEnv}
                  merchantId={MERCHANT_ID}
                  debug={true}
                  css={inputStyles}
                  origins={origins}
                />
                <label className="text-xs font-semibold text-slate-600">
                  CVV
                </label>
                <CoinflowCvvInput />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputField
                  label="Expiration Month"
                  value={formState.expMonth}
                  onChange={(value) => updateFormState("expMonth", value)}
                  placeholder="MM"
                />
                <InputField
                  label="Expiration Year"
                  value={formState.expYear}
                  onChange={(value) => updateFormState("expYear", value)}
                  placeholder="YY"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputField
                  label="First Name"
                  value={formState.firstName}
                  onChange={(value) => updateFormState("firstName", value)}
                />
                <InputField
                  label="Last Name"
                  value={formState.lastName}
                  onChange={(value) => updateFormState("lastName", value)}
                />
              </div>

              <InputField
                label="Email"
                value={formState.email}
                onChange={(value) => updateFormState("email", value)}
                placeholder="email@example.com"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InputField
                  label="Address"
                  value={formState.address1}
                  onChange={(value) => updateFormState("address1", value)}
                  placeholder="Street address"
                />
                <InputField
                  label="City"
                  value={formState.city}
                  onChange={(value) => updateFormState("city", value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InputField
                  label="State"
                  value={formState.state}
                  onChange={(value) => updateFormState("state", value)}
                  placeholder="CA"
                />
                <InputField
                  label="Zip"
                  value={formState.zip}
                  onChange={(value) => updateFormState("zip", value)}
                  placeholder="94107"
                />
                <InputField
                  label="Country"
                  value={formState.country}
                  onChange={(value) => updateFormState("country", value)}
                  placeholder="US"
                />
              </div>

              {cardError ? (
                <p className="text-xs text-red-600">{cardError}</p>
              ) : null}
              {cardSuccess ? (
                <p className="text-xs text-emerald-600">{cardSuccess}</p>
              ) : null}

              <button
                type="button"
                disabled={isCardSubmitting || !isCheckoutReady}
                onClick={handleCardCheckout}
                className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isCardSubmitting ? "Processing..." : "Pay with Card"}
              </button>
            </section>
          ) : (
            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Saved Card Checkout
                </h3>
                <p className="text-xs text-slate-500">
                  Reuse a saved card token and re-enter CVV.
                </p>
              </div>

              {isSavedCardLoading ? (
                <p className="text-xs text-slate-500">Loading saved card...</p>
              ) : savedCard ? (
                <>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    Saved Card: {savedCard.firstSix ?? "••••••"}
                    {savedCard.lastFour ?? "••••"} ({savedCard.cardType})
                  </div>
                  <label className="text-xs font-semibold text-slate-600">
                    CVV
                  </label>
                  <CoinflowCvvOnlyInput
                    ref={savedCardInputRef}
                    env={coinflowEnv}
                    merchantId={MERCHANT_ID}
                    css={inputStyles}
                    origins={origins}
                    token={savedCard.token}
                    cardType={savedCard.cardType}
                  />
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  Complete a new card checkout to enable saved card payments.
                </p>
              )}

              {savedError ? (
                <p className="text-xs text-red-600">{savedError}</p>
              ) : null}

              <button
                type="button"
                disabled={isSavedSubmitting || !savedCard || !isCheckoutReady}
                onClick={handleSavedCardCheckout}
                className="w-full rounded-2xl border border-blue-600 px-4 py-3 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavedSubmitting ? "Processing..." : "Pay with Saved Card"}
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  maybeInputType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maybeInputType?: HTMLInputTypeAttribute;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {label}
      <input
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        type={maybeInputType}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
