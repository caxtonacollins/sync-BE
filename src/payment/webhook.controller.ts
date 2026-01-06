import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';

@Controller('webhooks/flutterwave')
@ApiTags('Webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(forwardRef(() => WebhookService))
    private readonly webhookService: WebhookService,
  ) {
  }

  @Post('')
  @HttpCode(HttpStatus.OK)
  async handleFlutterwaveWebhook(
    @Body() payload: any,
    @Headers('verif-hash') signature: string,
  ) {
    this.logger.log('Received Flutterwave webhook', { event: payload?.event });
    try {
     
      await this.webhookService.handleWebhook(payload, signature);


    } catch (error) {
      console.error('Error processing Flutterwave webhook:', error);
      return { status: 'error', message: error.message };
    }
  }
}
