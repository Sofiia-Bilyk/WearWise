# Outfit assistance

WearWise suggests looks using exactly three contextual signals: hourly weather,
selected Google Calendar events with confirmed dress codes, and forgotten items.
Garment names, categories, and colors provide wardrobe information for assembling
the outfit. This version does not analyze wardrobe photos or learn preferences.

## Where to find it

- On **Log a look**, an AI Recommendations banner appears before a draft starts.
- On **Insights**, AI Recommendations is the fourth summary card after Utilization.
- Both entry points open the same popup and share results while you navigate.

Choose a city and date, optionally connect Google Calendar, load that day's events,
select the relevant ones, and confirm each selected event's dress code. Confirm
the data-sharing checkbox and select **Recommend looks**. Opening the popup or
switching pages does not start a model request. To generate again, use
**Change inputs or refresh suggestions**, then **Recommend looks**.

Suggestions never create outfit records or increment wear counts. Continue using
the normal logging and final-confirmation flow when you actually wear something.

## Server configuration

Add the following to the repository-root `.env` (already ignored by Git). Keep your
existing configuration. `.env.example` contains placeholders only.

```dotenv
ANTHROPIC_API_KEY=your_real_anthropic_key
ANTHROPIC_WORKSPACE_ID=
ANTHROPIC_MODEL=claude-sonnet-5-5
GOOGLE_CLIENT_ID=your_web_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/google/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=your_generated_fernet_key
FRONTEND_URL=http://localhost:3000
```

The workspace ID can be blank for an Anthropic workspace-scoped key. Use a model
available to your account. Obtain a key from [Anthropic's console](https://platform.claude.com/settings/keys).
Credentials are backend-only: never prefix them with `VITE_` or place them in React
source. Keep a strong, stable Flask `SECRET_KEY` in your existing server settings.

Generate a separate encryption key locally:

```powershell
.\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Put the result into `CALENDAR_TOKEN_ENCRYPTION_KEY` and keep it backed up with your
server secrets. Regenerating it makes stored calendar tokens unreadable and
requires reconnecting accounts. Never paste real keys into issues or chat.

Restart Flask after editing configuration. Apply the database migration:

```powershell
python -m flask --app wearwise_app.app db upgrade
```

No Anthropic key is required to log outfits or view the existing insights. Without
it, the assistant remains unavailable instead of displaying invented suggestions.
Google Calendar is optional: weather and forgotten items can be used on their own.

## Google Calendar setup

1. In Google Cloud, enable the Google Calendar API.
2. Configure OAuth consent and add development test users while the app is in testing.
3. Create a **Web application** OAuth client.
4. Register `http://localhost:3000/api/calendar/google/callback` as an authorized
   redirect URI. It must exactly match `GOOGLE_REDIRECT_URI`.
5. Add the OAuth client ID and client secret to `.env`; Google does not use a
   simple API key for accessing a person's private calendar.
6. Use **Connect Google Calendar** inside the assistant and complete Google's consent.

The scope is `https://www.googleapis.com/auth/calendar.events.owned.readonly`.
WearWise reads only the primary calendar and never changes events. OAuth uses
account-bound state, PKCE, and a ten-minute connection window. Tokens are encrypted
in the `google_calendar_connection` table, not stored in browser cookies or sent to
Anthropic. **Disconnect calendar** revokes the credential and removes the local
connection. A failed revoke leaves the local connection so the user can retry.
Callback authorization codes are redacted from development/Gunicorn access logs;
the Nginx callback location disables access logging.

## Weather and time zones

City lookup and hourly forecasts use [Open-Meteo](https://open-meteo.com/), with
[GeoNames](https://www.geonames.org/) location data. Exact GPS access is not needed.
The selected city determines the timezone and the allowed date range: today
through six days ahead. The calendar query covers that city's entire day,
including daylight-saving transitions. Weather includes early morning and evening,
with explicit Celsius, km/h, humidity, and precipitation-probability values.

Only public weather is cached for ten-minute buckets. The Open-Meteo open-access
endpoint needs no key for this non-commercial demo. Commercial deployment needs an
appropriate [plan and endpoint](https://open-meteo.com/en/pricing). Attribution is
shown in the popup. Incomplete or unavailable forecasts produce an error.

## What is shared with Anthropic

- Selected date and hourly weather, including units/timezone; not exact coordinates.
- Selected event timing and user-confirmed dress codes; not calendar titles,
  descriptions, attendees, locations, or conference links.
- Up to 80 active own-wardrobe candidates: item IDs, names, categories, colors,
  forgotten flags, and days unused. No photos, prices, brands, email, or OAuth tokens.

The shortlist includes at most 16 candidates per supported category. Items unused
for more than 30 days are prioritized; never-worn items use their creation date.
Future wear logs are ignored as evidence of past wear. A postponed item is not
prioritized as forgotten while its reminder is postponed.

Anthropic returns structured JSON. The server checks item ownership/archival again,
rejects unknown IDs, duplicates, and incomplete looks, and derives forgotten badges
from server facts. Weather and dress-code suitability take priority over forcing a
forgotten item into a look. Model calls have timeouts and no automatic retries.

## Results and limitations

Results are shared in account-scoped memory and cleared on account changes, relevant
wardrobe updates, or input changes. A city preference can be kept in that account's
browser-tab session storage so it survives the Google redirect. Calendar selections,
photos, and model results are not persisted there. Reopening a cached popup does not
refresh weather/events automatically; the displayed generation time makes that clear.

The current wardrobe category model requires a Top, Bottom, and Shoes item for a
complete suggestion. If those categories are missing, the assistant explains what
is needed without calling the model. It cannot verify garment warmth, material,
rain protection, or fine visual details from names alone. Suggestions require user
judgment; they are not a measured styling or weather-suitability guarantee.

## Docker

Compose explicitly forwards assistant settings to the backend. For the current
port-80 setup use `FRONTEND_URL=http://localhost` and
`GOOGLE_REDIRECT_URI=http://localhost/api/calendar/google/callback`, and register
that exact callback with Google. Use appropriate HTTPS origins/callbacks for a
public deployment. Match the origin used in your browser to `FRONTEND_URL`.

## Verification

```powershell
python -m pytest tests/test_outfit_assistant.py -v
npm run lint
npm run test:frontend
npm run test:components
npm run build:frontend
```

Automated provider tests are offline: they use real authentication/database/token
encryption with mocked weather, Google, and Anthropic responses. They do not prove
that your real credentials, Google consent configuration, model access, or live
recommendation quality work. After configuring your own credentials, verify those
through the app. Generating a real recommendation is a paid Anthropic request.


### Component verification

`npm run test:components` exercises the real React providers and components in a
virtual DOM. It verifies one shared recommendation result across the two entry
points, four Insights summary cards, explicit consent/dress-code controls, logout
isolation, and invalidation after wardrobe changes. Native dialog methods are
stubbed there, so this does not verify browser focus trapping or visual layout.
The browser test utility was unavailable during implementation; those visual and
native-browser checks remain manual. An isolated HTTP fixture also verified three
validated looks with one mocked model call and no outfit/wardrobe writes.
