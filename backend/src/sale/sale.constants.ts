// pub/sub channel that tells every instance to drop its cached sale row — fired
// on an admin update and by the seed script, so a horizontally-scaled tier stays
// coherent (the counter itself already lives in redis; this is just the metadata).
export const SALE_CHANGED_CHANNEL = 'sale:changed';
