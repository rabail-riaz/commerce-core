import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    store: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new ProductsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('scopes product search and pagination to the tenant', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));

    await service.list('tenant-a', { page: 1, limit: 10, search: 'shoe' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a' }),
      skip: 0,
      take: 10,
    }));
    expect(prisma.product.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a' }) }));
  });

  it('rejects a store from another tenant before creating a product', async () => {
    prisma.store.findFirst.mockResolvedValue(null);

    await expect(service.create('tenant-a', { name: 'Product', storeId: 'store-b' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('creates a product with normalized variants', async () => {
    prisma.store.findFirst.mockResolvedValue({ id: 'store-a' });
    prisma.product.create.mockResolvedValue({ id: 'product-a' });

    await service.create('tenant-a', {
      name: 'Product',
      storeId: 'store-a',
      variants: [{ sku: 'SKU-1', name: 'Small', price: '19.99', currency: 'USD' }],
    });

    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        variants: { create: [{ tenantId: 'tenant-a', sku: 'SKU-1', name: 'Small', price: '19.99', currency: 'USD' }] },
      }),
    }));
  });

  it('does not read a product outside the tenant', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.getById('tenant-a', 'product-b')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates product metadata and replaces variants within the tenant', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'product-a' });
    prisma.store.findFirst.mockResolvedValue({ id: 'store-a' });
    prisma.product.update.mockResolvedValue({ id: 'product-a' });

    await service.update('tenant-a', 'product-a', {
      name: 'Updated product',
      storeId: 'store-a',
      variants: [{ sku: 'SKU-2', name: 'Large', price: '24.99' }],
    });

    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_id: { tenantId: 'tenant-a', id: 'product-a' } },
      data: expect.objectContaining({
        variants: { deleteMany: {}, create: [{ tenantId: 'tenant-a', sku: 'SKU-2', name: 'Large', price: '24.99', currency: 'USD' }] },
      }),
    }));
  });

  it('deletes only an existing product in the active tenant', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'product-a' });
    prisma.product.delete.mockResolvedValue({ id: 'product-a' });

    await service.remove('tenant-a', 'product-a');

    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: 'tenant-a', id: 'product-a' } },
    });
  });
});
