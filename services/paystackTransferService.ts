import axios from 'axios';
import logger from '../utils/logger';

const PAYSTACK_BASE = 'https://api.paystack.co';

// Paystack test-mode data. Account resolution accepts the test bank code
// "001"; transfer recipients use the Zenith test code "057".
const TEST_RESOLVE_BANK_CODE = '001';
const TEST_TRANSFER_BANK_CODE = '057';
const TEST_ACCOUNT_NUMBER = '0000000000';

const isDevelopment = () => process.env.NODE_ENV !== 'production';

const getSecret = () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('Paystack not configured');
  return secret;
};

const headers = () => ({
  Authorization: `Bearer ${getSecret()}`,
  'Content-Type': 'application/json',
});

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

/**
 * Resolve an account number against a bank to get the verified account name.
 * In development, live bank codes are limited to 3 resolves/day, so we query
 * with the test bank code "001" + test account. The returned bank code /
 * account number stay the originals (for storage).
 */
export const resolveAccount = async (
  bankCode: string,
  accountNumber: string,
): Promise<ResolvedAccount> => {
  const useTest = isDevelopment();
  const resolveBankCode = useTest ? TEST_RESOLVE_BANK_CODE : bankCode;
  const resolveAccountNumber = useTest ? TEST_ACCOUNT_NUMBER : accountNumber;

  try {
    const response = await axios.get(`${PAYSTACK_BASE}/bank/resolve`, {
      params: { account_number: resolveAccountNumber, bank_code: resolveBankCode },
      headers: headers(),
    });

    if (!response.data?.status || !response.data?.data?.account_name) {
      throw new Error(response.data?.message || 'Could not resolve account');
    }

    return {
      accountNumber,
      accountName: response.data.data.account_name,
      bankCode,
    };
  } catch (err: any) {
    logger.warn(
      { err: err?.response?.data || err.message, bankCode: resolveBankCode, accountNumber: resolveAccountNumber },
      'paystack.resolve_account_failed',
    );
    throw new Error(
      err?.response?.data?.message || 'Could not resolve account name with Paystack',
    );
  }
};

export interface TransferRecipient {
  recipientCode: string;
  bankName: string;
}

/**
 * Create (or fetch existing) transfer recipient on Paystack.
 * In development, transfer recipients use the Zenith test code "057".
 */
export const createTransferRecipient = async (input: {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}): Promise<TransferRecipient> => {
  const useTest = isDevelopment();
  const recipientBankCode = useTest ? TEST_TRANSFER_BANK_CODE : input.bankCode;
  const recipientAccountNumber = useTest ? TEST_ACCOUNT_NUMBER : input.accountNumber;

  try {
    const response = await axios.post(
      `${PAYSTACK_BASE}/transferrecipient`,
      {
        type: 'nuban',
        name: input.accountName,
        account_number: recipientAccountNumber,
        bank_code: recipientBankCode,
        currency: 'NGN',
      },
      { headers: headers() },
    );

    if (!response.data?.status || !response.data?.data?.recipient_code) {
      throw new Error(response.data?.message || 'Could not create transfer recipient');
    }

    return {
      recipientCode: response.data.data.recipient_code,
      bankName: response.data.data.details?.bank_name || '',
    };
  } catch (err: any) {
    logger.warn(
      { err: err?.response?.data || err.message, accountNumber: recipientAccountNumber },
      'paystack.create_recipient_failed',
    );
    throw new Error(
      err?.response?.data?.message || 'Could not create transfer recipient',
    );
  }
};

export interface InitiatedTransfer {
  transferCode: string;
  reference: string;
  status: string; // 'pending' | 'otp' | 'success' | 'failed'
}

/**
 * Initiate a transfer to a recipient. Paystack sends an OTP to the business
 * phone at this point when OTP is required (returns status 'otp').
 */
export const initiateTransfer = async (input: {
  recipientCode: string;
  amountKobo: number;
  reason: string;
  reference: string;
}): Promise<InitiatedTransfer> => {
  try {
    const response = await axios.post(
      `${PAYSTACK_BASE}/transfer`,
      {
        source: 'balance',
        amount: input.amountKobo,
        recipient: input.recipientCode,
        reason: input.reason,
        reference: input.reference,
        currency: 'NGN',
      },
      { headers: headers() },
    );

    if (!response.data?.status) {
      throw new Error(response.data?.message || 'Could not initiate transfer');
    }

    const data = response.data.data;
    return {
      transferCode: data.transfer_code,
      reference: data.reference,
      status: data.status,
    };
  } catch (err: any) {
    logger.warn(
      { err: err?.response?.data || err.message, reference: input.reference },
      'paystack.initiate_transfer_failed',
    );
    throw new Error(err?.response?.data?.message || 'Could not initiate transfer');
  }
};

/**
 * Finalize an initiated transfer using the OTP sent to the business phone.
 */
export const finalizeTransfer = async (transferCode: string, otp: string): Promise<void> => {
  try {
    const response = await axios.post(
      `${PAYSTACK_BASE}/transfer/finalize_transfer`,
      { transfer_code: transferCode, otp },
      { headers: headers() },
    );

    if (!response.data?.status) {
      throw new Error(response.data?.message || 'Could not finalize transfer');
    }
  } catch (err: any) {
    logger.warn(
      { err: err?.response?.data || err.message, transferCode },
      'paystack.finalize_transfer_failed',
    );
    throw new Error(err?.response?.data?.message || 'Could not finalize transfer');
  }
};

export interface VerifiedTransfer {
  status: string; // 'pending' | 'otp' | 'success' | 'failed' | 'abandoned' | 'reversed'
}

/**
 * Fetch the current status of an initiated transfer by its transfer code.
 */
export const verifyTransfer = async (transferCode: string): Promise<VerifiedTransfer> => {
  try {
    const response = await axios.get(`${PAYSTACK_BASE}/transfer/${transferCode}`, {
      headers: headers(),
    });

    if (!response.data?.status || !response.data?.data?.status) {
      throw new Error(response.data?.message || 'Could not verify transfer');
    }

    return { status: response.data.data.status };
  } catch (err: any) {
    logger.warn(
      { err: err?.response?.data || err.message, transferCode },
      'paystack.verify_transfer_failed',
    );
    throw new Error(err?.response?.data?.message || 'Could not verify transfer');
  }
};

/**
 * Fetch the available balance on the integration.
 */
export const getBalance = async (): Promise<number> => {
  try {
    const response = await axios.get(`${PAYSTACK_BASE}/balance`, { headers: headers() });
    if (!response.data?.status) {
      throw new Error(response.data?.message || 'Could not fetch balance');
    }
    // balance is in kobo
    return Math.round((Number(response.data.data?.[0]?.balance || 0) / 100) * 100) / 100;
  } catch (err: any) {
    logger.warn({ err: err?.response?.data || err.message }, 'paystack.get_balance_failed');
    throw new Error(err?.response?.data?.message || 'Could not fetch Paystack balance');
  }
};

export const listBanks = async (): Promise<{ code: string; name: string }[]> => {
  try {
    const response = await axios.get(`${PAYSTACK_BASE}/bank`, { headers: headers() });
    if (!response.data?.status) {
      throw new Error(response.data?.message || 'Could not fetch banks');
    }
    return (response.data.data || []).map((b: any) => ({ code: b.code, name: b.name }));
  } catch (err: any) {
    logger.warn({ err: err?.response?.data || err.message }, 'paystack.list_banks_failed');
    throw new Error(err?.response?.data?.message || 'Could not fetch banks');
  }
};

export const getBankName = async (bankCode: string): Promise<string> => {
  const banks = await listBanks();
  return banks.find((b) => b.code === bankCode)?.name || '';
};
