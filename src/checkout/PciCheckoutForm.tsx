import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { HTMLInputTypeAttribute } from "react";
import {
  CardType,
  CoinflowCardNumberInput,
  CoinflowCardTokenResponse,
  CoinflowCvvInput,
  CoinflowCvvOnlyInput,
} from "@coinflowlabs/react";
import {
  createCoinflowCardCheckout,
  createCoinflowTokenCheckout,
  fetchCoinflowCustomer,
  fetchCoinflowTotals,
} from "../coinflowAPI/coinflowAPI";
import { useWallet } from "../wallet/Wallet";

const MERCHANT_ID = "swe-challenge";
const AUTH_BLOCKCHAIN = "solana";
const COINFLOW_ENV = "sandbox";
const API_BASE_URL = "https://api-sandbox.coinflow.cash";

type CardToken = {
  token: string;
  firstSix?: string;
  lastFour?: string;
  cardType?: CardType;
};

type CardTokenResponse = CardToken;

type SavedCard = CardToken;

type CurrencyCents = {
  currency: string;
  cents: number;
};

type CardTokenPayload = {
  firstSix: string;
  lastFour: string;
  token: string;
  referenceNumber: string;
  tokenHMAC: string;
  maybeCardType?: CardType;
};

/**
 * Submission states used for both new and saved card flows.
 */
type SubmissionStatus = "idle" | "submitting" | "success" | "error";

type SubmissionState = {
  status: SubmissionStatus;
  message: string | null;
};

type SubmissionAction =
  | { type: "reset" }
  | { type: "submit" }
  | { type: "success"; message?: string }
  | { type: "error"; message: string };

const initialSubmissionState: SubmissionState = {
  status: "idle",
  message: null,
};

const submissionReducer = (
  _state: SubmissionState,
  action: SubmissionAction
): SubmissionState => {
  switch (action.type) {
    case "reset":
      return initialSubmissionState;
    case "submit":
      return { status: "submitting", message: null };
    case "success":
      return { status: "success", message: action.message ?? null };
    case "error":
      return { status: "error", message: action.message };
    default:
      return _state;
  }
};

/**
 * Coerces unknown values into a non-empty string when possible.
 */
const parseString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const normalizeCardTypeValue = (
  value?: CardType | string | null
): CardType | null => {
  if (!value) return null;
  const upper = value.toUpperCase();
  const maybeCardType = Object.values(CardType).find(
    (cardType) => cardType === upper
  );
  return maybeCardType ?? null;
};

/**
 * Extracts the saved card list from a backend payload by checking
 * multiple possible keys, returning the first array candidate.
 */
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

const parseCardTokenResponse = (value: unknown): CardTokenPayload | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    firstSix?: unknown;
    lastFour?: unknown;
    token?: unknown;
    referenceNumber?: unknown;
    tokenHMAC?: unknown;
    cardType?: unknown;
  };
  const firstSix = parseString(record.firstSix);
  const lastFour = parseString(record.lastFour);
  const token = parseString(record.token);
  const referenceNumber = parseString(record.referenceNumber);
  const tokenHMAC = parseString(record.tokenHMAC);
  const rawCardType = parseString(record.cardType);
  const maybeCardType = normalizeCardTypeValue(rawCardType) ?? undefined;
  if (
    !firstSix ||
    !lastFour ||
    !token ||
    !referenceNumber ||
    !tokenHMAC
  ) {
    return null;
  }
  return {
    firstSix,
    lastFour,
    token,
    referenceNumber,
    tokenHMAC,
    maybeCardType,
  };
};

const parseCardInputError = (error: unknown): string | null => {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const isValid = record.isValid;
  const isCvvValid = record.isCvvValid;
  if (isValid !== false && isCvvValid !== false) return null;

  const messages: string[] = [];
  if (isValid === false) {
    const dataLength = record.dataLength;
    if (dataLength === 0) {
      messages.push("Card number is required.");
    } else {
      messages.push("Card number is invalid.");
    }
  }

  if (isCvvValid === false) {
    messages.push("CVV is invalid.");
  }

  return messages.length > 0 ? messages.join(" ") : null;
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
  const { wallet } = useWallet();
  const cardNumberInputRef = useRef<{
    getToken(): Promise<CoinflowCardTokenResponse>;
  }>();
  const savedCardInputRef = useRef<{
    getToken(): Promise<CardTokenResponse>;
  }>();
  const [newCardSubmission, dispatchNewCardSubmission] = useReducer(
    submissionReducer,
    initialSubmissionState
  );
  const [savedCardLookupSubmission, dispatchSavedCardLookupSubmission] = useReducer(
    submissionReducer,
    initialSubmissionState
  );
  const [savedCardCheckoutSubmission, dispatchSavedCardCheckoutSubmission] = useReducer(
    submissionReducer,
    initialSubmissionState
  );
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<"new" | "saved">("new");
  const [subtotal, setSubtotal] = useState<CurrencyCents | null>(null);
  const [total, setTotal] = useState<CurrencyCents | null>(null);
  const [isTotalsLoading, setIsTotalsLoading] = useState(false);
  const [totalsError, setTotalsError] = useState<string | null>(null);

  // Prefilled for testing purposes
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

  const defaultSubtotal = useMemo(() => ({ currency: "USD", cents: 20_00 }), []);
  const checkoutSubtotal = useMemo(
    () => subtotal ?? defaultSubtotal,
    [defaultSubtotal, subtotal]
  );
  const displayTotalAmount = useMemo(
    () => total ?? checkoutSubtotal,
    [checkoutSubtotal, total]
  );

  const maybeWalletPublicKey = wallet.publicKey?.toString() ?? null;
  const isCardSubmitting = newCardSubmission.status === "submitting";
  const cardError =
    newCardSubmission.status === "error" ? newCardSubmission.message : null;
  const cardSuccess =
    newCardSubmission.status === "success" ? newCardSubmission.message : null;
  const isSavedCardLoading = savedCardLookupSubmission.status === "submitting";
  const isSavedCardCheckoutSubmitting =
    savedCardCheckoutSubmission.status === "submitting";
  const maybeSavedCardType = savedCard?.cardType;
  const isSavedCardUsable = maybeSavedCardType !== undefined;
  const savedCardTypeLabel = maybeSavedCardType ?? "Unknown";
  const savedError =
    savedCardCheckoutSubmission.status === "error"
      ? savedCardCheckoutSubmission.message
      : savedCardLookupSubmission.status === "error"
        ? savedCardLookupSubmission.message
        : null;
  const isSavedCardBusy = isSavedCardLoading || isSavedCardCheckoutSubmitting;
  const maybeCardDisabledReason = isCardSubmitting ? "Card payment is processing." : null;
  const isCardDisabled = maybeCardDisabledReason !== null;
  const savedCardTokenTimeoutMs = 6000;
  const savedCardCheckoutTimeoutMs = 8000;

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

  const inputStyles = useMemo(
    () => ({
      base: 'font-family: Montserrat, sans-serif; padding: 0 8px; border: 0px; margin: 0; width: 100%; font-size: 13px; line-height: 48px; height: 48px; box-sizing: border-box; -moz-box-sizing: border-box;',
      focus: 'outline: 0;',
      error: 'box-shadow: 0 0 6px 0 rgba(224, 57, 57, 0.5); border: 1px solid rgba(224, 57, 57, 0.5);',
      cvv: {
        base: 'font-family: Montserrat, sans-serif; padding: 0 8px; border: 0px; margin: 0; width: 100%; font-size: 13px; line-height: 48px; height: 48px; box-sizing: border-box; -moz-box-sizing: border-box;',
        focus: 'outline: 0;',
        error: 'box-shadow: 0 0 6px 0 rgba(224, 57, 57, 0.5); border: 1px solid rgba(224, 57, 57, 0.5);',
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

  const normalizeCardType = useCallback(normalizeCardTypeValue, []);

  const buildSavedCardFromTokenPayload = useCallback(
    (value: CardTokenPayload): SavedCard => ({
      token: value.token,
      cardType: value.maybeCardType,
      firstSix: value.firstSix,
      lastFour: value.lastFour,
    }),
    []
  );

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
      const cardType = normalizeCardType(cardTypeValue) ?? undefined;

      const maybeFirstSix = parseString(
        record.firstSix ??
          record.first_six ??
          record.first6 ??
          record.bin ??
          record.binNumber
      );
      const maybeLastFour = parseString(
        record.lastFour ??
          record.last_four ??
          record.last4 ??
          record.lastDigits ??
          record.last_digits
      );
      return {
        token,
        cardType,
        firstSix: maybeFirstSix ?? undefined,
        lastFour: maybeLastFour ?? undefined,
      };
    },
    [normalizeCardType]
  );

  const extractFirstSavedCardFromCustomer = useCallback(
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

  const fetchTotals = useCallback(async () => {
    if (!maybeWalletPublicKey) {
      setTotalsError("Missing user identity for Coinflow totals.");
      return;
    }

    setIsTotalsLoading(true);
    setTotalsError(null);
    try {
      const data = await fetchCoinflowTotals({
        apiBaseUrl: API_BASE_URL,
        merchantId: MERCHANT_ID,
        walletAddress: maybeWalletPublicKey,
        authBlockchain: AUTH_BLOCKCHAIN,
        subtotal: defaultSubtotal,
      });
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
    defaultSubtotal,
    logError,
    logSuccess,
    maybeWalletPublicKey,
  ]);

  const fetchSavedCard = useCallback(async () => {
    dispatchSavedCardLookupSubmission({ type: "submit" });

    if (!maybeWalletPublicKey) {
      dispatchSavedCardLookupSubmission({
        type: "error",
        message: "Missing user identity for saved card.",
      });
      return;
    }

    try {
      const getCustomerResponse = await fetchCoinflowCustomer({
        apiBaseUrl: API_BASE_URL,
        walletAddress: maybeWalletPublicKey,
        authBlockchain: AUTH_BLOCKCHAIN,
      });
      const maybeFirstSavedCard = extractFirstSavedCardFromCustomer(getCustomerResponse);
      if (maybeFirstSavedCard) {
        setSavedCard(maybeFirstSavedCard);
        logSuccess("Saved card fetched.", {
          token: maybeFirstSavedCard.token,
          cardType: maybeFirstSavedCard.cardType,
        });
        dispatchSavedCardLookupSubmission({ type: "success" });
      } else {
        dispatchSavedCardLookupSubmission({
          type: "error",
          message: "No saved card available for this customer.",
        });
      }
    } catch (error) {
      logError("Failed to fetch saved card.", error);
      const message =
        error instanceof Error ? error.message : "Failed to fetch saved card.";
      dispatchSavedCardLookupSubmission({ type: "error", message });
    }
  }, [
    logError,
    logSuccess,
    maybeWalletPublicKey,
    extractFirstSavedCardFromCustomer,
  ]);

  useEffect(() => {
    fetchTotals().catch((error) => {
      logError("Failed to fetch totals.", error);
    });
  }, [fetchTotals, logError]);

  useEffect(() => {
    if (checkoutMode !== "saved") return;
    if (savedCard || isSavedCardLoading) return;
    fetchSavedCard().catch((error) => {
      logError("Failed to fetch saved card.", error);
    });
  }, [checkoutMode, fetchSavedCard, isSavedCardLoading, logError, savedCard]);

  const handleCardCheckout = useCallback(async () => {
    dispatchNewCardSubmission({ type: "reset" });

    const validationMessage = validateCardForm();
    if (validationMessage) {
      dispatchNewCardSubmission({ type: "error", message: validationMessage });
      return;
    }

    if (!cardNumberInputRef.current) {
      dispatchNewCardSubmission({
        type: "error",
        message: "Card inputs are not ready yet.",
      });
      return;
    }

    if (!maybeWalletPublicKey) {
      dispatchNewCardSubmission({
        type: "error",
        message: "Missing user identity for Coinflow checkout.",
      });
      return;
    }

    dispatchNewCardSubmission({ type: "submit" });
    try {
      const cardTokenResponse = await cardNumberInputRef.current.getToken();
      const maybeParsedTokenResponse = parseCardTokenResponse(cardTokenResponse);
      if (!maybeParsedTokenResponse) {
        throw new Error("Card token response was invalid.");
      }
      const maybeSavedCard = buildSavedCardFromTokenPayload(maybeParsedTokenResponse);
      if (maybeSavedCard) {
        setSavedCard(maybeSavedCard);
      }
      const payload = {
        subtotal: {
          cents: checkoutSubtotal.cents,
        },
        card: {
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
          cardToken: maybeParsedTokenResponse.token,
        },
      };

      const cardCheckoutResponse = await createCoinflowCardCheckout({
        apiBaseUrl: API_BASE_URL,
        merchantId: MERCHANT_ID,
        walletAddress: maybeWalletPublicKey,
        authBlockchain: AUTH_BLOCKCHAIN,
        payload,
      });
      console.log("card checkout response: ", cardCheckoutResponse);
      dispatchNewCardSubmission({ type: "success" });
      onSuccess();
    } catch (error) {
      logError("Card checkout failed.", error);
      const message =
        parseCardInputError(error) ??
        (error instanceof Error ? error.message : "Card checkout failed.");
      dispatchNewCardSubmission({ type: "error", message });
    }
  }, [
    formState,
    onSuccess,
    checkoutSubtotal,
    validateCardForm,
    maybeWalletPublicKey,
    buildSavedCardFromTokenPayload,
    logError,
  ]);

  const handleSavedCardCheckout = useCallback(async () => {
    dispatchSavedCardCheckoutSubmission({ type: "reset" });

    if (!savedCard) {
      dispatchSavedCardCheckoutSubmission({
        type: "error",
        message: "No saved card available yet.",
      });
      return;
    }

    if (!savedCardInputRef.current) {
      dispatchSavedCardCheckoutSubmission({
        type: "error",
        message: "Saved card input is not ready yet.",
      });
      return;
    }

    dispatchSavedCardCheckoutSubmission({ type: "submit" });
    try {
      logSuccess("Requesting saved card token.", {
        cardType: savedCard.cardType ?? null,
        lastFour: savedCard.lastFour ?? null,
      });
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const tokenResponse = await Promise.race([
        savedCardInputRef.current.getToken(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                "Saved card tokenization timed out. Make sure the CVV input is loaded and a CVV is entered."
              )
            );
          }, savedCardTokenTimeoutMs);
        }),
      ]).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
      logSuccess("Saved card token response received.");
      if (!tokenResponse?.token) {
        dispatchSavedCardCheckoutSubmission({
          type: "error",
          message: "TokenEx did not return a card token. Please retry.",
        });
        return;
      }
      if (!maybeWalletPublicKey) {
        dispatchSavedCardCheckoutSubmission({
          type: "error",
          message: "Missing user identity for Coinflow checkout.",
        });
        return;
      }
      const payload = {
        subtotal: checkoutSubtotal,
        token: tokenResponse.token,
      };

      // For handling timeouts
      const abortController = new AbortController();
      const checkoutTimeoutId = setTimeout(() => {
        abortController.abort();
      }, savedCardCheckoutTimeoutMs);
      const tokenCheckoutResponse = await createCoinflowTokenCheckout({
        apiBaseUrl: API_BASE_URL,
        merchantId: MERCHANT_ID,
        walletAddress: maybeWalletPublicKey,
        authBlockchain: AUTH_BLOCKCHAIN,
        payload,
        signal: abortController.signal,
      }).finally(() => {
        clearTimeout(checkoutTimeoutId);
      });
      console.log("checkout token response: ", tokenCheckoutResponse);
      const updatedSavedCard = extractFirstSavedCardFromCustomer(tokenCheckoutResponse);
      if (updatedSavedCard) {
        setSavedCard(updatedSavedCard);
      }
      dispatchSavedCardCheckoutSubmission({ type: "success" });
      onSuccess();
    } catch (error) {
      logError("Saved card checkout failed.", error);
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Saved card checkout timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "Saved card checkout failed.";
      dispatchSavedCardCheckoutSubmission({ type: "error", message });
    }
  }, [
    logError,
    logSuccess,
    maybeWalletPublicKey,
    onSuccess,
    extractFirstSavedCardFromCustomer,
    savedCard,
    savedCardCheckoutTimeoutMs,
    savedCardTokenTimeoutMs,
    checkoutSubtotal,
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
          <div
            role="tablist"
            aria-label="Checkout mode"
            className="grid w-full max-w-sm grid-cols-2 gap-3 text-xs font-semibold text-slate-400"
          >
            <button
              type="button"
              role="tab"
              aria-selected={checkoutMode === "new"}
              onClick={() => setCheckoutMode("new")}
              className={`w-full rounded-t-xl border border-b-0 px-4 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                checkoutMode === "new"
                  ? "border-slate-200 bg-white text-slate-900 shadow-sm"
                  : "border-transparent bg-slate-300 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              }`}
            >
              New Card
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={checkoutMode === "saved"}
              onClick={() => setCheckoutMode("saved")}
              className={`w-full rounded-t-xl border border-b-0 px-4 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                checkoutMode === "saved"
                  ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                  : "border-transparent bg-blue-100 text-blue-500 hover:bg-blue-200 hover:text-blue-700"
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
                    : `$${(displayTotalAmount.cents / 100).toFixed(2)} ${
                        displayTotalAmount.currency
                      }`}
                </p>
                {totalsError ? (
                  <p className="text-xs text-red-600">{totalsError}</p>
                ) : null}
              </div>

              <div className="grid gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Card Number
                </label>
                <CoinflowCardNumberInput
                  ref={cardNumberInputRef}
                  env={COINFLOW_ENV}
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

              {isCardDisabled ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  {maybeCardDisabledReason ??
                    "Complete checkout setup to pay with card."}
                </div>
              ) : null}
              <button
                type="button"
                disabled={isCardDisabled}
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
                    {savedCard.lastFour ?? "••••"} ({savedCardTypeLabel})
                  </div>
                  {maybeSavedCardType ? (
                    <>
                      <label className="text-xs font-semibold text-slate-600">
                        CVV
                      </label>
                      <CoinflowCvvOnlyInput
                        ref={savedCardInputRef}
                        env={COINFLOW_ENV}
                        merchantId={MERCHANT_ID}
                        debug={true}
                        css={inputStyles}
                        origins={origins}
                        token={savedCard.token}
                        cardType={maybeSavedCardType}
                      />
                    </>
                  ) : (
                    <p className="text-xs text-amber-600">
                      Saved card is missing the card type. Please re-save this
                      card to enable saved checkout.
                    </p>
                  )}
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
                disabled={isSavedCardBusy || !savedCard || !isSavedCardUsable}
                onClick={handleSavedCardCheckout}
                className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSavedCardCheckoutSubmitting
                  ? "Processing..."
                  : isSavedCardLoading
                    ? "Loading..."
                    : "Pay with Saved Card"}
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
