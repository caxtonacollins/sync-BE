import { LiquidityCheckDto } from "./dto/swap-order/update-swap-order.dto";

export interface SwapOrderMetadata {
  provider: string;
  liquidityCheck: LiquidityCheckDto;
  minToAmount: string;
  deadline: number;
  error?: string;
  swapId: string;
  transactionHash: string;
  completedAt: string;
}
