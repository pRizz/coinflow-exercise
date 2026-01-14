import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CardType,
  CoinflowCardNumberInput,
  CoinflowCvvInput,
  CoinflowCvvOnlyInput,
} from "@coinflowlabs/react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "../wallet/Wallet";

const MERCHANT_ID = "swe-challenge";
// const MERCHANT_ID = "sandbox-merchant-id-peter-ryszkiewicz";
const SANDBOX_API_KEY = import.meta.env.VITE_SANDBOX_API_KEY as string | undefined;
// const SANDBOX_API_KEY = '';

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

  const [formState, setFormState] = useState({
    expMonth: "",
    expYear: "",
    email: "",
    firstName: "",
    lastName: "",
    address1: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  });

  // const origins = useMemo(
  //   () => (typeof window !== "undefined" ? [window.location.origin] : []),
  //   []
  // );


  const origins = ["http://localhost:5173"];

  console.log("origins: ", origins);

  const baseSubtotal = useMemo(() => ({ currency: "USD", cents: 20_00 }), []);
  const resolvedSubtotal = useMemo(
    () => subtotal ?? baseSubtotal,
    [baseSubtotal, subtotal]
  );
  const displayAmount = useMemo(
    () => total ?? resolvedSubtotal,
    [resolvedSubtotal, total]
  );
  const isCheckoutReady = Boolean(sessionKey) && !isSessionKeyLoading;
  const coinflowEnv = "sandbox";
  const merchantId = "swe-challenge";
  const apiBaseUrl = "https://api-sandbox.coinflow.cash";
  const apiKey = SANDBOX_API_KEY;
  const buildHeaders = useCallback(
    (extra?: Record<string, string>) => {
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
        ...extra,
      };

      if (sessionKey) {
        headers["x-coinflow-auth-session-key"] = sessionKey;
      }

      return headers;
    },
    [sessionKey]
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
    // if (!apiKey) {
    //   setSessionKeyError("Missing Coinflow API key. Set VITE_SANDBOX_API_KEY.");
    //   return;
    // }

    if (!ready) return;

    setSessionKeyError(null);
    setIsSessionKeyLoading(true);

    const walletAddress = wallet.publicKey?.toString() ?? null;
    const userId = getUserIdentifier();
    if (!walletAddress && !userId) {
      setSessionKeyError("Missing user identity for Coinflow session key.");
      return;
    }

    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        Authorization: apiKey,
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
    if (!sessionKey) {
      setTotalsError(
        "Waiting for Coinflow session key before loading totals."
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
  }, [apiBaseUrl, baseSubtotal, buildHeaders, merchantId, parseError, sessionKey]);

  useEffect(() => {
    fetchSessionKey().catch((error) => {
      logError("Unhandled session key rejection.", error);
    });
  }, [fetchSessionKey, logError]);

  useEffect(() => {
    if (!sessionKey) return;
    fetchTotals().catch((error) => {
      logError("Unhandled totals rejection.", error);
    });
  }, [fetchTotals, logError, sessionKey]);

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
      const tokenResponse = await savedCardInputRef.current.getToken();
      const payload = {
        subtotal: resolvedSubtotal,
        token: tokenResponse.token,
      };

      await postJson(`/api/checkout/token/${merchantId}`, payload);
      onSuccess();
    } catch (error) {
      logError("Saved card checkout failed.", error);
      const message =
        error instanceof Error ? error.message : "Saved card checkout failed.";
      setSavedError(message);
    } finally {
      setIsSavedSubmitting(false);
    }
  }, [merchantId, onSuccess, postJson, savedCard, resolvedSubtotal]);

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
                  merchantId={MERCHANT_ID} // Replace with your merchant id
                  debug={true} // Change to false for production
                  // merchantId={merchantId}
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

              {savedCard ? (
                <>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    Saved Token: {savedCard.firstSix ?? "••••••"}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {label}
      <input
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
