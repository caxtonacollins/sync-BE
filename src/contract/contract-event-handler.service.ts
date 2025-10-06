import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventListenerClientService } from './event-listener-client.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';

@Injectable()
export class ContractEventHandlerService implements OnModuleInit {
    private readonly logger = new Logger(ContractEventHandlerService.name);
    private contractAddress: string;

    constructor(
        private readonly eventListenerClient: EventListenerClientService,
        private readonly liquidityEventProcessor: LiquidityEventProcessorService,
    ) {
        this.contractAddress = process.env.LIQUIDITY_CONTRACT_ADDRESS || '';
    }

    async onModuleInit() {
        const isAvailable = await this.eventListenerClient.checkHealth();
        if (!isAvailable) {
            this.logger.warn('Event listener service is not available. Skipping event listener setup.');
            return;
        }

        if (this.contractAddress) {
            await this.setupEventListeners();
        } else {
            this.logger.warn('LIQUIDITY_CONTRACT_ADDRESS not configured. Event listeners will not be started.');
        }
    }

    private async setupEventListeners(): Promise<void> {
        try {
            const initResult = await this.eventListenerClient.initialize();
            if (!initResult.success) {
                this.logger.error('Failed to initialize event listener:', initResult.message);
                return;
            }
            this.logger.log('Event listener initialized successfully');
            await this.subscribeToAllContractEvents();
        } catch (error) {
            this.logger.error('Failed to set up event listeners:', error);
        }
    }

    async subscribeToAllContractEvents(): Promise<void> {
        const callbackUrl = `http://localhost:5000/contract/events`;
        this.logger.log(`Subscribing to all events for contract: ${this.contractAddress}`);
        const result = await this.eventListenerClient.subscribeToContractEvents(
            this.contractAddress,
            { from_block: 'latest', chunk_size: 100 },
            callbackUrl,
        );
        if (result.success) {
            this.logger.log(`Successfully subscribed to all contract events: ${result.subscriptionId}`);
        } else {
            this.logger.error(`Failed to subscribe to all contract events: ${result.message}`);
        }
    }

    async subscribeToTransaction(transactionHash: string): Promise<void> {
        const callbackUrl = `http://localhost:5000/contract/events`;
        const result = await this.eventListenerClient.subscribeToTransactionStatus(
            transactionHash,
            callbackUrl
        );
        if (result.success) {
            this.logger.log(`Subscribed to transaction ${transactionHash}: ${result.subscriptionId}`);
        } else {
            this.logger.error(`Failed to subscribe to transaction: ${result.message}`);
        }
    }

    async getListenerStatus() {
        return await this.eventListenerClient.getStatus();
    }

    handleEvent(eventPayload: any) {
        this.logger.log(`Received event from starknet-event-listener: ${JSON.stringify(eventPayload)}`);
        this.liquidityEventProcessor.process(eventPayload).catch((err) => {
            this.logger.error('Failed to process liquidity event', err);
        });
    }
}
