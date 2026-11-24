import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { DOCUMENT_UPLOAD } from '../../../common/files/upload-policy.js';
import {
  AddBlockedDateUseCase,
  GetMyAvailabilityUseCase,
  RemoveBlockedDateUseCase,
  ReplaceAvailabilityWindowsUseCase,
  UpdateProviderSettingsUseCase,
} from '../application/availability.use-cases.js';
import {
  DeleteDocumentUseCase,
  ListMyDocumentsUseCase,
  UploadDocumentUseCase,
} from '../application/documents.use-cases.js';
import { DocumentType } from '../domain/media.js';
import {
  AddBlockedDateRequestDto,
  AvailabilityResponseDto,
  AvailabilityWindowDto,
  BlockedDateResponseDto,
  ReplaceWindowsRequestDto,
  SettingsResponseDto,
  UpdateSettingsRequestDto,
  toAvailabilityResponse,
  toBlockedDateResponse,
  toSettingsResponse,
} from './dto/availability.dto.js';
import {
  DocumentResponseDto,
  UploadDocumentRequestDto,
  toDocumentResponse,
} from './dto/media.dto.js';

/** KYC documents and working schedule. */
@ApiTags('Providers: Me')
@ApiAuth()
@Roles(Role.PROVIDER)
@Controller('providers/me')
export class MyProviderScheduleController {
  constructor(
    private readonly listDocuments: ListMyDocumentsUseCase,
    private readonly uploadDocument: UploadDocumentUseCase,
    private readonly deleteDocument: DeleteDocumentUseCase,
    private readonly getAvailability: GetMyAvailabilityUseCase,
    private readonly replaceWindows: ReplaceAvailabilityWindowsUseCase,
    private readonly addBlockedDate: AddBlockedDateUseCase,
    private readonly removeBlockedDate: RemoveBlockedDateUseCase,
    private readonly updateSettings: UpdateProviderSettingsUseCase,
  ) {}

  @Get('documents')
  @ApiOperation({ summary: 'My verification documents (signed, short-lived links)' })
  @ApiEnvelopeResponse(DocumentResponseDto, { description: 'Documents', isArray: true })
  @ApiErrors(404)
  async documents(@CurrentUser() user: AuthenticatedUser): Promise<DocumentResponseDto[]> {
    return (await this.listDocuments.execute(user.id)).map(toDocumentResponse);
  }

  @Post('documents')
  @FileUpload(
    DOCUMENT_UPLOAD,
    { type: { type: 'string', enum: Object.values(DocumentType), description: 'Document type' } },
    ['type'],
  )
  @ApiOperation({
    summary: 'Upload a KYC document (PDF/JPEG/PNG/WebP, max 5 MB), stored privately',
  })
  @ApiEnvelopeResponse(DocumentResponseDto, { description: 'Uploaded', status: HttpStatus.CREATED })
  @ApiErrors(400, 404, 413, 422)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: UploadDocumentRequestDto,
  ): Promise<DocumentResponseDto> {
    return toDocumentResponse(
      await this.uploadDocument.execute(user.id, body.type, toUploadedFile(file)),
    );
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document that has not been reviewed yet' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404, 409)
  async removeDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    await this.deleteDocument.execute(user.id, documentId);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Weekly windows, upcoming blocked dates and booking settings' })
  @ApiEnvelopeResponse(AvailabilityResponseDto, { description: 'Availability' })
  @ApiErrors(404)
  async availability(@CurrentUser() user: AuthenticatedUser): Promise<AvailabilityResponseDto> {
    return toAvailabilityResponse(await this.getAvailability.execute(user.id));
  }

  @Put('availability/windows')
  @ApiOperation({ summary: 'Replace the weekly schedule (Nepal time)' })
  @ApiEnvelopeResponse(AvailabilityWindowDto, { description: 'Saved windows', isArray: true })
  @ApiErrors(400, 404)
  async setWindows(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ReplaceWindowsRequestDto,
  ): Promise<AvailabilityWindowDto[]> {
    return this.replaceWindows.execute(user.id, body.windows);
  }

  @Post('availability/blocked-dates')
  @ApiOperation({ summary: 'Block a whole day' })
  @ApiEnvelopeResponse(BlockedDateResponseDto, {
    description: 'Blocked',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 404, 409, 422)
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AddBlockedDateRequestDto,
  ): Promise<BlockedDateResponseDto> {
    return toBlockedDateResponse(
      await this.addBlockedDate.execute(user.id, body.date, body.reason ?? null),
    );
  }

  @Delete('availability/blocked-dates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unblock a day' })
  @ApiNoContentResponse({ description: 'Unblocked' })
  @ApiErrors(400, 404)
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.removeBlockedDate.execute(user.id, id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Daily booking cap and slot length' })
  @ApiEnvelopeResponse(SettingsResponseDto, { description: 'Saved settings' })
  @ApiErrors(400, 404)
  async settings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateSettingsRequestDto,
  ): Promise<SettingsResponseDto> {
    return toSettingsResponse(await this.updateSettings.execute(user.id, body));
  }
}
