import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnchoringService } from './anchoring.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  UserRole,
  TriggerAnchorDto,
  AnchorRecord,
  MerkleProofBundle,
  VerifyProofRequestDto,
  VerifyProofResponseDto,
} from '@gateflow/shared-types';

@ApiTags('Anchoring')
@Controller()
export class AnchoringController {
  constructor(private readonly anchoringService: AnchoringService) {}

  @Post('anchors/run')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger an anchoring run manually for a site' })
  async runAnchoring(@Body() body: TriggerAnchorDto): Promise<AnchorRecord> {
    return this.anchoringService.runAnchoring(body.siteId, body.period);
  }

  @Get('anchors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Auditor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all anchors and on-chain statuses' })
  async getAnchors(): Promise<AnchorRecord[]> {
    return this.anchoringService.getAnchors();
  }

  @Get('anchors/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Auditor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get anchor details with transaction hash' })
  async getAnchorById(@Param('id') id: string): Promise<AnchorRecord> {
    return this.anchoringService.getAnchorById(id);
  }

  @Get('attendance/events/:id/proof')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Auditor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrieve full Merkle proof bundle for an event' })
  async getProofBundleForEvent(@Param('id') id: string): Promise<MerkleProofBundle> {
    return this.anchoringService.getProofBundleForEvent(id);
  }

  @Post('verify/proof')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public endpoint to verify a proof bundle against the Stellar chain' })
  async verifyProof(@Body() body: VerifyProofRequestDto): Promise<VerifyProofResponseDto> {
    return this.anchoringService.verifyProof(body);
  }
}
