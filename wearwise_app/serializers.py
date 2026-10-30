def item_to_dict(item):
    """Serialize an Item with computed wear stats.

    Expects item.outfit_items to be already loaded (via joinedload) so that
    each outfit_item.outfit is also available without triggering extra queries.
    """
    wear_count = len(item.outfit_items)
    last_worn = None
    if item.outfit_items:
        dates = [
            oi.outfit.worn_date
            for oi in item.outfit_items
            if oi.outfit is not None
        ]
        last_worn = max(dates).isoformat() if dates else None
    return {
        "id": str(item.id),
        "name": item.name,
        "category": item.category or "Top",
        "image": item.image_path or "",
        "wearCount": wear_count,
        "lastWorn": last_worn or item.created_at.date().isoformat(),
        "color": item.color or item.ai_color_primary or "",
        "brand": item.brand or "",
        "addedDate": item.created_at.date().isoformat(),
        "postponedUntil": (
            item.postponed_until.isoformat() if item.postponed_until else None
        ),
        "cost": item.cost,
    }


def outfit_to_dict(outfit):
    return {
        "id": str(outfit.id),
        "date": outfit.worn_date.isoformat(),
        "items": [str(oi.item_id) for oi in outfit.outfit_items],
        "imagePath": outfit.image_path,
    }
