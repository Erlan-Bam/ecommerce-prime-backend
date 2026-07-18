import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProductService } from './product.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductFilterDto,
  BulkUpdateProductCategoriesDto,
  ApplyCatalogCleanupDto,
  CreateProductVariantGroupDto,
  UpdateProductVariantGroupDto,
} from './dto';
import { AdminGuard } from '../shared/guards/admin.guard';
import { Public } from '../shared/decorator/public.decorator';
import { Roles } from '../shared/decorator/roles.decorator';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product (Admin)' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all products with filters' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  findAll(@Query() filter: ProductFilterDto) {
    return this.productService.findAll(filter);
  }

  @Public()
  @Get('filters')
  @ApiOperation({ summary: 'Get available filters for products' })
  @ApiResponse({ status: 200, description: 'Filters retrieved successfully' })
  getFilters(
    @Query('categoryId') categoryId?: string,
    @Query('brandIds') brandIds?: string,
  ) {
    const parsedBrandIds = brandIds
      ?.split(',')
      .map((brandId) => brandId.trim())
      .filter(Boolean);

    return this.productService.getFilters(categoryId, parsedBrandIds);
  }

  @Get('variant-groups')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search product variant groups (Admin)' })
  @ApiResponse({ status: 200, description: 'Variant groups retrieved' })
  findVariantGroups(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productService.findVariantGroups(search, Number(limit) || 50);
  }

  @Post('variant-groups')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product variant group (Admin)' })
  @ApiResponse({ status: 201, description: 'Variant group created' })
  createVariantGroup(@Body() dto: CreateProductVariantGroupDto) {
    return this.productService.createVariantGroup(dto);
  }

  @Get('variant-groups/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get product variant group products (Admin)' })
  @ApiResponse({ status: 200, description: 'Variant group retrieved' })
  findVariantGroup(@Param('id') id: string) {
    return this.productService.findVariantGroup(id);
  }

  @Patch('variant-groups/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product variant group (Admin)' })
  @ApiResponse({ status: 200, description: 'Variant group updated' })
  updateVariantGroup(
    @Param('id') id: string,
    @Body() dto: UpdateProductVariantGroupDto,
  ) {
    return this.productService.updateVariantGroup(id, dto);
  }

  @Delete('variant-groups/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product variant group (Admin)' })
  @ApiResponse({ status: 200, description: 'Variant group deleted' })
  deleteVariantGroup(@Param('id') id: string) {
    return this.productService.deleteVariantGroup(id);
  }

  @Get('deleted/list')
  @UseGuards(AdminGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get soft-deleted products (Admin)' })
  @ApiResponse({ status: 200, description: 'Deleted products retrieved' })
  findDeleted(@Query() filter: ProductFilterDto) {
    return this.productService.findDeleted({
      page: filter.page,
      limit: filter.limit,
    });
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }

  @Patch('bulk/categories')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk replace product categories (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Product categories updated successfully',
  })
  bulkUpdateCategories(@Body() dto: BulkUpdateProductCategoriesDto) {
    return this.productService.bulkUpdateCategories(dto);
  }

  @Get('catalog-cleanup/suggestions')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find suspicious product category assignments' })
  @ApiResponse({
    status: 200,
    description: 'Catalog cleanup suggestions retrieved successfully',
  })
  getCatalogCleanupSuggestions(@Query('limit') limit?: string) {
    return this.productService.getCatalogCleanupSuggestions(Number(limit) || 200);
  }

  @Post('catalog-cleanup/apply')
  @UseGuards(AdminGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiBody({ type: ApplyCatalogCleanupDto })
  @ApiOperation({
    summary: 'Preview or apply automatic product category cleanup (Admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalog cleanup previewed or applied successfully',
  })
  applyCatalogCleanup(@Body() dto: ApplyCatalogCleanupDto) {
    return this.productService.applyCatalogCleanup(dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (Admin)' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete product (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Product soft deleted successfully',
  })
  remove(@Param('id') id: string) {
    return this.productService.remove(id);
  }

  @Post(':id/restore')
  @UseGuards(AdminGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Restore soft-deleted product within 7 days (Admin)',
  })
  @ApiResponse({ status: 200, description: 'Product restored successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot restore - expired or not deleted',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  restore(@Param('id') id: string) {
    return this.productService.restore(id);
  }
}
