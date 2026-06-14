/** Treat Delivered and Received as a completed drop-off (matches Laku-Driver). */
export function isDeliveryStopComplete(status: string | null | undefined): boolean {
  return status === 'Delivered' || status === 'Received';
}
