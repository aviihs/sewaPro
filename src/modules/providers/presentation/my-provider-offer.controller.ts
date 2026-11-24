import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../../common/auth/auth.decorators.js';
import { type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { FileUpload, type MulterFile, toUploadedFile } from '../../../common/files/multipart.js';
import { IMAGE_UPLOAD } from '../../../common/files/upload-policy.js';
import {
  ListMyOfferingsUseCase,
  RemoveMyOfferingUseCase,
  UpsertMyOfferingUseCase,
} from '../application/offerings.use-cases.js';
import {
  AddPortfolioImageUseCase,
  DeletePortfolioImageUseCase,
  ListMyPortfolioUseCase,
} from '../application/portfolio.use-cases.js';
import {
  AddPortfolioImageRequestDto,
  PortfolioImageResponseDto,
  toPortfolioResponse,
} from './dto/media.dto.js';
import {
  OfferingResponseDto,
  UpsertOfferingRequestDto,
  toOfferingResponse,
} from './dto/offering.dto.js';

/** What the provider offers: catalog services with pricing, and portfolio images. */
@ApiTags('Providers: Me')
@ApiAuth()
@Roles(Role.PROVIDER)
@Controller('providers/me')
export class MyProviderOfferController {
  constructor(
    private readonly listOfferings: ListMyOfferingsUseCase,
    private readonly upsertOffering: UpsertMyOfferingUseCase,
    private readonly removeOffering: RemoveMyOfferingUseCase,
    private readonly listPortfolio: ListMyPortfolioUseCase,
    private readonly addImage: AddPortfolioImageUseCase,
    private readonly deleteImage: DeletePortfolioImageUseCase,
  ) {}

  @Get('services')
  @ApiOperation({ summary: 'Services I offer, with pricing' })
  @ApiEnvelopeResponse(OfferingResponseDto, { description: 'Offerings', isArray: true })
  @ApiErrors(404)
  async services(@CurrentUser() user: AuthenticatedUser): Promise<OfferingResponseDto[]> {
    return (await this.listOfferings.execute(user.id)).map(toOfferingResponse);
  }

  @Put('services/:serviceId')
  @ApiOperation({ summary: 'Offer a catalog service or change its pricing' })
  @ApiEnvelopeResponse(OfferingResponseDto, { description: 'Saved offering' })
  @ApiErrors(400, 404, 422)
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() body: UpsertOfferingRequestDto,
  ): Promise<OfferingResponseDto> {
    const input = {
      pricingType: body.pricingType,
      price: body.price ?? null,
      description: body.description ?? null,
      isActive: body.isActive ?? true,
    };
    return toOfferingResponse(await this.upsertOffering.execute(user.id, serviceId, input));
  }

  @Delete('services/:serviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop offering a service' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ): Promise<void> {
    await this.removeOffering.execute(user.id, serviceId);
  }

  @Get('portfolio')
  @ApiOperation({ summary: 'My portfolio images' })
  @ApiEnvelopeResponse(PortfolioImageResponseDto, { description: 'Images', isArray: true })
  @ApiErrors(404)
  async portfolio(@CurrentUser() user: AuthenticatedUser): Promise<PortfolioImageResponseDto[]> {
    return (await this.listPortfolio.execute(user.id)).map(toPortfolioResponse);
  }

  @Post('portfolio')
  @FileUpload(IMAGE_UPLOAD, {
    caption: { type: 'string', description: 'Optional caption (max 200)' },
  })
  @ApiOperation({ summary: 'Upload a portfolio image (JPEG/PNG/WebP, max 3 MB, max 20 images)' })
  @ApiEnvelopeResponse(PortfolioImageResponseDto, {
    description: 'Uploaded',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 404, 413, 422)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: AddPortfolioImageRequestDto,
  ): Promise<PortfolioImageResponseDto> {
    const view = await this.addImage.execute(user.id, toUploadedFile(file), body.caption ?? null);
    return toPortfolioResponse(view);
  }

  @Delete('portfolio/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a portfolio image' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async deletePortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<void> {
    await this.deleteImage.execute(user.id, imageId);
  }
}
