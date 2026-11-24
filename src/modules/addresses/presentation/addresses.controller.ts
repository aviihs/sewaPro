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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../../common/auth/auth.decorators.js';
import { Role, type AuthenticatedUser } from '../../../common/auth/role.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { CreateAddressUseCase } from '../application/create-address.use-case.js';
import { DeleteAddressUseCase } from '../application/delete-address.use-case.js';
import { GetMyAddressUseCase } from '../application/get-my-address.use-case.js';
import { ListMyAddressesUseCase } from '../application/list-my-addresses.use-case.js';
import { UpdateAddressUseCase } from '../application/update-address.use-case.js';
import { CreateAddressRequestDto, UpdateAddressRequestDto } from './dto/address.request.dto.js';
import { AddressResponseDto, toAddressResponse } from './dto/address.response.dto.js';

@ApiTags('Addresses')
@ApiAuth()
@Roles(Role.CUSTOMER)
@Controller('addresses')
export class AddressesController {
  constructor(
    private readonly createAddress: CreateAddressUseCase,
    private readonly listAddresses: ListMyAddressesUseCase,
    private readonly getAddress: GetMyAddressUseCase,
    private readonly updateAddress: UpdateAddressUseCase,
    private readonly deleteAddress: DeleteAddressUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Save a new address (max 10; the first becomes default)' })
  @ApiEnvelopeResponse(AddressResponseDto, { description: 'Created', status: HttpStatus.CREATED })
  @ApiErrors(400, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateAddressRequestDto,
  ): Promise<AddressResponseDto> {
    const { isDefault, area, district, landmark, ...rest } = body;
    const fields = {
      ...rest,
      area: area ?? null,
      district: district ?? null,
      landmark: landmark ?? null,
    };
    return toAddressResponse(await this.createAddress.execute(user.id, fields, isDefault));
  }

  @Get()
  @ApiOperation({ summary: 'List my addresses (default first)' })
  @ApiEnvelopeResponse(AddressResponseDto, { description: 'Addresses', isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<AddressResponseDto[]> {
    return (await this.listAddresses.execute(user.id)).map(toAddressResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my addresses' })
  @ApiEnvelopeResponse(AddressResponseDto, { description: 'Address' })
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AddressResponseDto> {
    return toAddressResponse(await this.getAddress.execute(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an address or make it the default' })
  @ApiEnvelopeResponse(AddressResponseDto, { description: 'Updated' })
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAddressRequestDto,
  ): Promise<AddressResponseDto> {
    return toAddressResponse(await this.updateAddress.execute(user.id, id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address (the newest remaining becomes default)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deleteAddress.execute(user.id, id);
  }
}
