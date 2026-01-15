/// These types are generated from the Coinflow API documentation and used while calling the Coinflow API.

export type CoinflowCurrencyCents = {
  currency: string;
  cents: number;
};

export type CoinflowVerification = {
  reference?: string;
  hash?: string;
  status?: string;
  vendor?: string;
  name?: string;
  attested?: boolean;
};

export type CoinflowAvailability = {
  status?: string;
  reason?: string;
  editor?: string;
  updatedAt?: string;
};

export type CoinflowBrand = {
  portalBrand?: string;
  logo?: string;
  displayName?: string;
};

export type CoinflowColors = {
  style?: string;
  font?: string;
  ctaColor?: string;
  textColorAction?: string;
  textColorAccent?: string;
  textColor?: string;
  backgroundAccent2?: string;
  backgroundAccent?: string;
  background?: string;
  primary?: string;
};

export type CoinflowFeeAmount = {
  cents?: number;
};

export type CoinflowWithdrawFeeTier = {
  fixed?: CoinflowFeeAmount;
  variableBps?: number;
  minimum?: CoinflowFeeAmount;
  maximum?: CoinflowFeeAmount;
};

export type CoinflowWithdrawFees = {
  business?: CoinflowWithdrawFeeTier;
  user?: CoinflowWithdrawFeeTier;
  swapBps?: number;
};

export type CoinflowCustomWithdrawFee = {
  coverProcessingFees?: boolean;
  cents?: number;
  currency?: string;
  percent?: number | null;
  isFixed?: boolean;
};

export type CoinflowCustomWithdrawFees = {
  global?: CoinflowCustomWithdrawFee;
  lineItemLabel?: string;
  isBundled?: boolean;
};

export type CoinflowWallets = {
  evm?: {
    usdcPayer?: string;
    feePayer?: string;
  };
  solana?: {
    usdcPayer?: string;
    feePayer?: string;
  };
};

export type CoinflowApiKey = {
  privateUuid?: string;
  publicUuid?: string;
};

export type CoinflowMerchantUser = {
  email?: string;
  scope?: string;
  password?: string;
  secret?: string;
  resetNonce?: string;
  resetNonceUsed?: boolean;
};

export type CoinflowGoLiveChecklist = {
  acceptedToS?: boolean;
  programWhitelistRequests?: unknown[];
  rfis?: Array<{
    status?: string;
    url?: string;
    name?: string;
  }>;
  onboardingFormSubmitted?: boolean;
  applicationSubmitted?: boolean;
  applicationSubmittedAt?: string;
};

export type CoinflowCardSettings = {
  paysFees?: boolean;
  paysChargebackProtectionFees?: boolean;
  paysGasFees?: boolean;
  paysFxFees?: boolean;
  paysNetworkFees?: boolean;
  customerEmailNotifications?: boolean;
  merchantEmailNotifications?: boolean;
  avsCheck?: boolean;
  threeDsChallengePreference?: string;
  enforce3DSWhenProtectionExempt?: boolean;
};

export type CoinflowAchSettings = {
  paysFees?: boolean;
  allowDelayedTransactions?: boolean;
  customerEmailNotifications?: boolean;
  merchantEmailNotifications?: boolean;
  instantSettle?: boolean;
};

export type CoinflowWireSettings = {
  paysFees?: boolean;
  paysFxFees?: boolean;
  customerEmailNotifications?: boolean;
  merchantEmailNotifications?: boolean;
};

export type CoinflowPixSettings = {
  paysFees?: boolean;
  paysFxFees?: boolean;
  customerEmailNotifications?: boolean;
  merchantEmailNotifications?: boolean;
};

export type CoinflowIbanSettings = {
  paysFees?: boolean;
  paysFxFees?: boolean;
  customerEmailNotifications?: boolean;
  merchantEmailNotifications?: boolean;
};

export type CoinflowInstantSettings = {
  paysFees?: boolean;
  customerEmailNotifications?: boolean;
  merchantEmailNotifications?: boolean;
};

export type CoinflowCryptoPayinSettings = {
  stables?: {
    feeBps?: number;
    paysFees?: boolean;
    enabled?: boolean;
  };
  majors?: {
    feeBps?: number;
    paysFees?: boolean;
    enabled?: boolean;
  };
  volatile?: {
    feeBps?: number;
    paysFees?: boolean;
    enabled?: boolean;
  };
  enabled?: boolean;
  maxGasFeePayment?: CoinflowFeeAmount;
  coinbaseDisabled?: boolean;
  transferOnly?: boolean;
  customerEmailNotifications?: boolean;
  merchantEmailNotifications?: boolean;
  fixedFee?: CoinflowFeeAmount;
  paysFee?: boolean;
};

export type CoinflowNSureSettings = {
  nSureInsurance?: boolean;
  nSureAchInsurance?: boolean;
  nSurePartnerId?: string;
  segmentId?: string;
  protectionMinimum?: CoinflowFeeAmount;
  ignoreRejection?: boolean;
  doNotReview?: boolean;
  enableOverrideReview?: boolean;
  overrideReviewHours?: number;
  nSureFixedFee?: CoinflowFeeAmount;
  nSureVariableFeeBps?: number;
  disableOverrides?: boolean;
  unprotectedDailyMaximum?: CoinflowFeeAmount;
  unprotectedMonthlyMaximum?: CoinflowFeeAmount;
  accountType?: string;
};

export type CoinflowInterchangeFees = {
  settings?: {
    useType?: boolean;
    useRegion?: boolean;
    useScheme?: boolean;
    useBrand?: boolean;
    useDurbin?: boolean;
  };
  rates?: {
    VISA?: {
      bps?: number;
      fixedFee?: CoinflowFeeAmount;
      networkBps?: number;
    };
    MSTR?: {
      bps?: number;
      fixedFee?: CoinflowFeeAmount;
      networkBps?: number;
    };
  };
};

export type CoinflowMerchant = {
  _id?: string;
  merchantId?: string;
  verification?: CoinflowVerification;
  brand?: CoinflowBrand;
  colors?: CoinflowColors;
  url?: string;
  withdrawFees?: CoinflowWithdrawFees;
  customWithdrawFees?: CoinflowCustomWithdrawFees;
  wallets?: CoinflowWallets;
  apiKey?: string;
  webhookValidationKey?: string;
  apiKeys?: CoinflowApiKey[];
  kycType?: string;
  settlementToken?: string;
  users?: CoinflowMerchantUser[];
  ubos?: CoinflowVerification[];
  goLiveChecklist?: CoinflowGoLiveChecklist;
  cardSettings?: CoinflowCardSettings;
  achSettings?: CoinflowAchSettings;
  wireSettings?: CoinflowWireSettings;
  pixSettings?: CoinflowPixSettings;
  ibanSettings?: CoinflowIbanSettings;
  instantSettings?: CoinflowInstantSettings;
  cryptoPayinSettings?: CoinflowCryptoPayinSettings;
  nSureSettings?: CoinflowNSureSettings;
  hideBranding?: boolean;
  onlyShowTotal?: boolean;
  skipSendWithdrawEmail?: boolean;
  pushToCardEnabled?: boolean;
  requireAniCheck?: boolean;
  refundBalanceLimit?: CoinflowFeeAmount;
  creditSeed?: string;
  withdrawSettlementLocation?: string;
  enforceJwt?: boolean;
  delayedSettlementDays?: number;
  interchangeFees?: CoinflowInterchangeFees;
};

export type CoinflowChargebackProtectionOverrideLog = {
  reason?: string;
  editor?: string;
  editorType?: string;
  overriddenAt?: string;
  ipAddress?: string;
  nsureOverrideReason?: string;
};

export type CoinflowBankAccount = {
  reference?: string;
  alias?: string;
  accountNumber?: string;
  token?: string;
  last4?: string;
  accountHash?: string;
  accountNumberOnlyHash?: string;
  isDeleted?: boolean;
  isTokenized?: boolean;
};

export type CoinflowCard = {
  type?: string;
  createdAt?: string;
  token?: string;
  last4?: string;
  isDeleted?: boolean;
  disbursementStatus?: string;
  nameOnCard?: string;
  hasAddress?: boolean;
};

export type CoinflowSepa = {
  reference?: string;
  alias?: string;
  token?: string;
  last4?: string;
  accountHash?: string;
  sortCode?: string;
};

export type CoinflowFasterPayment = {
  reference?: string;
  alias?: string;
  token?: string;
  last4?: string;
  accountHash?: string;
  sortCode?: string;
};

export type CoinflowInstant = {
  reference?: string;
  alias?: string;
  token?: string;
  last4?: string;
  accountHash?: string;
  sortCode?: string;
};

export type CoinflowCustomer = {
  _id?: string;
  createdAt?: string;
  verification?: CoinflowVerification;
  email?: string;
  blockchain?: string;
  customerId?: string;
  availability?: CoinflowAvailability;
  merchant?: CoinflowMerchant;
  chargebackProtectionEnabled?: boolean;
  failedAttemptSetting?: string;
  verificationSetting?: string;
  exempt3DS?: boolean;
  chargebackProtectionOverrideLog?: CoinflowChargebackProtectionOverrideLog;
  bankAccounts?: CoinflowBankAccount[];
  cards?: CoinflowCard[];
  sepas?: CoinflowSepa[];
  fasterPayments?: CoinflowFasterPayment[];
  instants?: CoinflowInstant[];
};

export type GetCustomerResponse = {
  customer: CoinflowCustomer | null;
};
