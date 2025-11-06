import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { FlutterwaveWebhookDto } from './dto/webhook.dto';
import { ApiTags } from '@nestjs/swagger';

@Controller('webhooks/flutterwave')
@ApiTags('Webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  async handleWebhook(
    @Headers('verif-hash') signature: string,
    @Body() payload: FlutterwaveWebhookDto,
  ) {
    this.logger.debug(
      `Received Flutterwave webhook: ${JSON.stringify(payload)}`,
    );

    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    // Verify webhook signature
    const isValid = this.webhookService.validateWebhookSignature(
      signature,
      JSON.stringify(payload),
    );

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    return this.webhookService.handleWebhook(payload);
  }
}
