import { FiatAccount, CryptoWallet } from '@prisma/client';

export function mapFiatAccountWithUser(account: FiatAccount & { user?: any }) {
  const firstName = account.user?.firstName || '';
  const lastName = account.user?.lastName || '';
  return {
    id: account.id,
    name: `${firstName} ${lastName}`.trim(),
    accountNumber: account.accountNumber,
    balance: 0,
    currency: account.currency,
    initials: `${(firstName[0] || '') + (lastName[0] || '')}`,
    isDefault: account.isDefault,
  };
}

export function mapCryptoWalletWithUser(wallet: CryptoWallet & { user?: any }) {
  const firstName = wallet.user?.firstName || '';
  const lastName = wallet.user?.lastName || '';
  return {
    id: wallet.id,
    name: `${firstName} ${lastName}`.trim(),
    isRegisteredToLiquidity: wallet.isRegisteredToLiquidity,
    address: wallet.address,
    balance: 0,
    currency: wallet.currency,
    initials: `${(firstName[0] || '') + (lastName[0] || '')}`,
    isDefault: wallet.isDefault,
  };
}
