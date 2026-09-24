# Shashtna Player — Advertisement feed contract

The Home hero shows Shashtna advertisements. The app works fully offline with
the bundled list (`src/features/ads/localAdvertisements.ts`). To manage ads
from the Shashtna website / admin panel, publish a JSON feed and set its URL
in `src/features/ads/adsConfig.ts` → `ADS_REMOTE_URL`. No APK rebuild is needed
when ads change after that.

## Delivery and fallback

1. On Home, bundled ads (or the last cached feed) render immediately.
2. The app fetches `ADS_REMOTE_URL` (6 s timeout).
3. Success → the list is shown and cached on the device.
4. Failure → the cached list is used; with no cache, the bundled list.

The app never blocks startup or navigation on the feed.

## Response

Either a JSON array of ads, or `{ "advertisements": [ ... ] }`.

```json
{
  "advertisements": [
    {
      "id": "ramadan-2027",
      "title": { "ar": "عروض رمضان", "en": "Ramadan offers" },
      "description": { "ar": "خصم على الاشتراك السنوي", "en": "Discount on the yearly plan" },
      "cta": { "ar": "اعرف أكثر", "en": "Learn more" },
      "image": "https://cdn.example.com/ads/ramadan-1920x1080.webp",
      "active": true,
      "startsAt": "2027-02-01T00:00:00Z",
      "endsAt": "2027-03-10T00:00:00Z",
      "priority": 10,
      "actionType": "external",
      "actionTarget": "https://example.com/offers",
      "displayDuration": 8000
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Stable unique id. |
| `title` | yes | `{ar, en}` or a plain string (used for both). |
| `description`, `cta` | no | Same format as `title`. The button is shown only with a `cta` and a valid action. |
| `image` | no | `http(s)` URL; without it the ad uses the branded accent layout. |
| `active` | no | Default `true`. |
| `startsAt` / `endsAt` | no | ISO-8601; outside the window the ad is hidden (re-checked when served from cache). |
| `priority` / `order` | no | `priority`: higher first. `order`: lower first. |
| `actionType` / `actionTarget` | no | See below. The nested form `"action": { "type": ..., ... }` is also accepted. |
| `displayDuration` | no | ms on screen, clamped to 4000–30000 (default 8000). |

### Actions

| `actionType` | `actionTarget` | Effect |
|---|---|---|
| `home`, `movies`, `series`, `live`, `favorites`, `settings` | — | Opens that page |
| `liveCategory` | category name, e.g. `Sports` | Opens Live TV on that category |
| `external` | `http(s)` URL | Opens the link (TV boxes without a browser: set `displayUrl` so the address is shown on the ad) |
| anything else / invalid | — | Ad is shown without a button |

Invalid entries (no `id`/`title`, non-http links) are dropped individually;
they never break the rest of the feed.
