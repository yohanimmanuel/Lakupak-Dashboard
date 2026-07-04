import { prisma } from '../../common/prisma';
import { syncMarketplaceUserToBuyerProfiles } from '@/utils/buyerSync';
import { isDuplicateAddressIdError, resetAddressIdSequence } from '@/utils/addressSequence';
import {
  attachGeocodeToAddress,
  clearGeocodeFieldsForAddressUpdate,
  normalizeAddressKey,
} from '@/utils/addressGeocodeCache';
import { enqueueSideEffect } from '@/lib/sideEffectQueue';
import type { Prisma } from '@/lib/prisma-generated';

export type CreateMarketplaceAddressInput = {
  fullName: string;
  phone: string;
  address: string;
  label?: string | null;
  isDefault?: boolean | null;
};

export type UpdateMarketplaceAddressInput = {
  fullName?: string | null;
  phone?: string | null;
  address?: string | null;
  label?: string | null;
  isDefault?: boolean | null;
};

type AddressRecord = NonNullable<Awaited<ReturnType<typeof prisma.address.findUnique>>>;

const mapMarketplaceAddress = (address: AddressRecord) => ({
  id: address.id,
  userId: address.userId,
  fullName: address.fullName,
  phone: address.phone,
  address: address.address,
  latitude: address.latitude,
  longitude: address.longitude,
  geocodePrecision: address.geocodePrecision,
  label: address.label,
  isDefault: Boolean(address.isDefault),
  createdAt: address.createdAt.toISOString(),
  updatedAt: address.updatedAt.toISOString(),
});

const normalizeLabel = (label?: string | null) => {
  if (!label || typeof label !== 'string') {
    return 'home';
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : 'home';
};

export const fetchMarketplaceAddresses = async (userId: number) => {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return addresses.map(mapMarketplaceAddress);
};

export const createMarketplaceAddress = async (args: { userId: number; input: CreateMarketplaceAddressInput }) => {
  const { userId, input } = args;

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const address = input.address.trim();
  if (!fullName || !phone || !address) {
    throw new Error('Invalid address input');
  }

  const executeCreate = async () =>
    prisma.$transaction(async (tx) => {
      const newAddress = await tx.address.create({
        data: {
          userId,
          fullName,
          phone,
          address,
          addressNormalized: normalizeAddressKey(address),
          isDefault: Boolean(input.isDefault),
          label: normalizeLabel(input.label),
        },
      });

      if (newAddress.isDefault) {
        await tx.address.updateMany({
          where: { userId, NOT: { id: newAddress.id } },
          data: { isDefault: false },
        });
        await tx.marketplaceUser.update({
          where: { id: userId },
          data: { chosenAddress: newAddress.address },
        });
      }

      return newAddress;
    });

  try {
    const created = mapMarketplaceAddress(await executeCreate());
    await syncMarketplaceUserToBuyerProfiles(userId);
    enqueueSideEffect(
      'attachGeocodeToAddress(create)',
      () => attachGeocodeToAddress(created.id, address),
      { retries: 2 },
    );
    return created;
  } catch (error) {
    if (isDuplicateAddressIdError(error)) {
      await resetAddressIdSequence();
      const created = mapMarketplaceAddress(await executeCreate());
      await syncMarketplaceUserToBuyerProfiles(userId);
      enqueueSideEffect(
        'attachGeocodeToAddress(create)',
        () => attachGeocodeToAddress(created.id, address),
        { retries: 2 },
      );
      return created;
    }
    throw error;
  }
};

export const updateMarketplaceAddress = async (args: {
  userId: number;
  addressId: number;
  input: UpdateMarketplaceAddressInput;
}) => {
  const { userId, addressId, input } = args;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.userId !== userId) {
      throw new Error('Address not found');
    }

    const addressChanged =
      typeof input.address === 'string' && input.address.trim() !== existing.address.trim();

    const updateData: Prisma.AddressUpdateInput = {
      ...(typeof input.fullName === 'string' ? { fullName: input.fullName.trim() } : {}),
      ...(typeof input.phone === 'string' ? { phone: input.phone.trim() } : {}),
      ...(typeof input.label === 'string' ? { label: normalizeLabel(input.label) } : {}),
      ...(typeof input.isDefault === 'boolean' ? { isDefault: input.isDefault } : {}),
    };

    if (typeof input.address === 'string') {
      const trimmedAddress = input.address.trim();
      updateData.address = trimmedAddress;
      if (addressChanged) {
        Object.assign(updateData, clearGeocodeFieldsForAddressUpdate(trimmedAddress));
      } else {
        updateData.addressNormalized = normalizeAddressKey(trimmedAddress);
      }
    }

    const updatedAddress = await tx.address.update({
      where: { id: addressId },
      data: updateData,
    });

    if (input.isDefault === true) {
      await tx.address.updateMany({
        where: { userId, NOT: { id: updatedAddress.id } },
        data: { isDefault: false },
      });
      await tx.marketplaceUser.update({
        where: { id: userId },
        data: { chosenAddress: updatedAddress.address || null },
      });
    } else if (input.isDefault === false && existing.isDefault) {
      await tx.marketplaceUser.update({
        where: { id: userId },
        data: { chosenAddress: null },
      });
    }

    return updatedAddress;
  });

  const result = mapMarketplaceAddress(updated);
  await syncMarketplaceUserToBuyerProfiles(userId);
  if (typeof input.address === 'string') {
    const trimmedAddressForGeocode = input.address.trim();
    enqueueSideEffect(
      'attachGeocodeToAddress(update)',
      () => attachGeocodeToAddress(result.id, trimmedAddressForGeocode),
      { retries: 2 },
    );
  }
  return result;
};

export const deleteMarketplaceAddress = async (args: { userId: number; addressId: number }) => {
  const { userId, addressId } = args;

  const deleted = await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.userId !== userId) {
      throw new Error('Address not found');
    }

    await tx.address.delete({ where: { id: addressId } });

    if (existing.isDefault) {
      await tx.marketplaceUser.update({
        where: { id: userId },
        data: { chosenAddress: null },
      });
    }

    return existing;
  });

  const result = mapMarketplaceAddress(deleted);
  await syncMarketplaceUserToBuyerProfiles(userId);
  return result;
};

