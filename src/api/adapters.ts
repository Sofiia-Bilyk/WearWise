import { ClothingItem, Outfit } from '../types';
import { ApiItem } from './items';
import { ApiOutfit } from './outfits';

export function apiItemToClothing(i: ApiItem): ClothingItem {
  return {
    id: i.id,
    name: i.name,
    category: i.category as ClothingItem['category'],
    image: i.image,
    wearCount: i.wearCount,
    lastWorn: i.lastWorn,
    color: i.color,
    brand: i.brand,
    addedDate: i.addedDate,
    postponedUntil: i.postponedUntil,
    cost: i.cost ?? undefined,
  };
}

export function apiOutfitToOutfit(o: ApiOutfit): Outfit {
  return { id: o.id, date: o.date, items: o.items };
}
