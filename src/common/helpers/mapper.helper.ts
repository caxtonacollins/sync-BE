import { CryptoWallet } from '@prisma/client';

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
