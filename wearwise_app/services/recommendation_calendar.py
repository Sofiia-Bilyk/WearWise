"""Read the user's primary Google Calendar; store OAuth tokens encrypted."""
import json
import secrets
import time
from datetime import datetime, time as clock, timedelta
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app, session
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
import requests

from ..models import db, GoogleCalendarConnection
from .exceptions import ValidationError
from .recommendation_weather import RecommendationUnavailable

SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned.readonly'
DRESS_CODES = {'professional', 'smart_casual', 'casual', 'sport', 'formal'}


def config(name):
    value = current_app.config.get(name)
    if not value:
        raise RecommendationUnavailable('Google Calendar is not configured on this server.')
    return value


def cipher():
    try:
        return Fernet(config('CALENDAR_TOKEN_ENCRYPTION_KEY').encode())
    except (ValueError, TypeError) as exc:
        raise RecommendationUnavailable('Calendar token encryption is not configured correctly.') from exc


def connection(user_id):
    return db.session.get(GoogleCalendarConnection, user_id)


def flow(state=None, verifier=None):
    return Flow.from_client_config({'web': {
        'client_id': config('GOOGLE_CLIENT_ID'), 'client_secret': config('GOOGLE_CLIENT_SECRET'),
        'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
        'token_uri': 'https://oauth2.googleapis.com/token',
    }}, scopes=[SCOPE], state=state, code_verifier=verifier,
       autogenerate_code_verifier=verifier is None,
       redirect_uri=config('GOOGLE_REDIRECT_URI'))


def connect_url(user_id):
    cipher()  # Fail before consent if tokens cannot be stored securely.
    state = secrets.token_urlsafe(32)
    oauth = flow(state=state)
    url, _ = oauth.authorization_url(access_type='offline', prompt='consent')
    # This cookie contains only short-lived flow state/PKCE data, not OAuth tokens.
    session['google_calendar_flow'] = {'state': state, 'owner': user_id,
        'verifier': oauth.code_verifier, 'expires': time.time() + 600}
    return url


def encrypt_credentials(credentials):
    fields = json.loads(credentials.to_json())
    safe = {key: fields.get(key) for key in ('token', 'refresh_token', 'expiry', 'scopes')}
    return cipher().encrypt(json.dumps(safe).encode()).decode()


def finish_connect(user_id, args):
    saved = session.get('google_calendar_flow')
    state = args.get('state', '')
    if (not saved or saved.get('owner') != user_id or saved.get('expires', 0) < time.time()
            or not isinstance(state, str) or not state.isascii() or len(state) > 200
            or not secrets.compare_digest(saved.get('state', ''), state)):
        raise ValidationError('Calendar connection expired. Please connect again.')
    session.pop('google_calendar_flow', None)
    if args.get('error') or not args.get('code'):
        raise ValidationError('Google Calendar connection was cancelled or denied.')
    try:
        oauth = flow(state=state, verifier=saved['verifier'])
        # Exchange only against Google's fixed HTTPS token endpoint. This also
        # supports a registered localhost HTTP redirect without disabling TLS checks.
        oauth.fetch_token(code=args['code'], timeout=10)
        credentials = oauth.credentials
        granted = oauth.oauth2session.token.get('scope')
        if isinstance(granted, str):
            granted = granted.split()
        if granted is not None and SCOPE not in granted:
            raise ValueError('Read-only event scope was not granted')
        if not credentials.refresh_token or not credentials.has_scopes([SCOPE]):
            raise ValueError('Required offline/read-only access was not granted')
        record = connection(user_id)
        if record is None:
            record = GoogleCalendarConnection(user_id=user_id)
            db.session.add(record)
        record.encrypted_credentials = encrypt_credentials(credentials)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        raise RecommendationUnavailable('Could not connect Google Calendar. Please try again.') from exc


def credentials_for(record):
    try:
        data = json.loads(cipher().decrypt(record.encrypted_credentials.encode()))
        data.update(client_id=config('GOOGLE_CLIENT_ID'), client_secret=config('GOOGLE_CLIENT_SECRET'),
                    token_uri='https://oauth2.googleapis.com/token')
        return Credentials.from_authorized_user_info(data, scopes=[SCOPE])
    except (InvalidToken, ValueError, TypeError, KeyError) as exc:
        raise RecommendationUnavailable('Reconnect Google Calendar to continue.') from exc


def refresh(credentials):
    transport = Request()
    def bounded_request(url, method='GET', body=None, headers=None, **kwargs):
        return transport(url, method=method, body=body, headers=headers, timeout=10)
    credentials.refresh(bounded_request)


def list_events(user_id, day, timezone):
    record = connection(user_id)
    if record is None:
        raise ValidationError('Connect Google Calendar before selecting events.')
    zone = ZoneInfo(timezone)
    start = datetime.combine(day, clock.min, zone)
    end = datetime.combine(day + timedelta(days=1), clock.min, zone)
    original = record.encrypted_credentials
    credentials = credentials_for(record)
    before_refresh = (credentials.token, credentials.expiry)
    try:
        if not credentials.valid:
            refresh(credentials)
        events, page = [], None
        for _ in range(5):
            params = {'timeMin': start.isoformat(), 'timeMax': end.isoformat(),
                'singleEvents': 'true', 'orderBy': 'startTime', 'maxResults': 100,
                'timeZone': timezone,
                'fields': 'items(id,summary,start,end,status),nextPageToken'}
            if page:
                params['pageToken'] = page
            response = requests.get('https://www.googleapis.com/calendar/v3/calendars/primary/events',
                params=params, headers={'Authorization': f'Bearer {credentials.token}'}, timeout=(3, 10))
            if response.status_code == 401:
                refresh(credentials)
                response = requests.get('https://www.googleapis.com/calendar/v3/calendars/primary/events',
                    params=params, headers={'Authorization': f'Bearer {credentials.token}'}, timeout=(3, 10))
            response.raise_for_status()
            data = response.json()
            events.extend(event for event in data.get('items', []) if event.get('status') != 'cancelled')
            page = data.get('nextPageToken')
            if not page:
                break
        if page:
            raise RecommendationUnavailable('Too many calendar events to load for one day.')
        if before_refresh != (credentials.token, credentials.expiry):
            # Do not overwrite a concurrent reconnect/disconnect with old tokens.
            updated = db.session.execute(db.update(GoogleCalendarConnection).where(
                GoogleCalendarConnection.user_id == user_id,
                GoogleCalendarConnection.encrypted_credentials == original,
            ).values(encrypted_credentials=encrypt_credentials(credentials)))
            if updated.rowcount != 1:
                raise RecommendationUnavailable('Calendar connection changed. Reload its events.')
            db.session.commit()
    except Exception as exc:
        db.session.rollback()
        raise RecommendationUnavailable('Could not read Google Calendar. Retry or reconnect it.') from exc
    return [{'id': event['id'], 'title': event.get('summary', '(Untitled event)')[:160],
             'start': event['start'], 'end': event['end']} for event in events]


def selected_context(user_id, selected, day, timezone):
    if not isinstance(selected, list) or len(selected) > 12:
        raise ValidationError('Select no more than 12 calendar events.')
    if not selected:
        return []
    events = {event['id']: event for event in list_events(user_id, day, timezone)}
    context, seen = [], set()
    for choice in selected:
        if not isinstance(choice, dict) or set(choice) != {'id', 'dressCode'}:
            raise ValidationError('Choose an event and confirm its dress code.')
        key, dress = choice['id'], choice['dressCode']
        if not isinstance(key, str) or not isinstance(dress, str):
            raise ValidationError('Invalid calendar selection.')
        if key in seen or key not in events or dress not in DRESS_CODES:
            raise ValidationError('An event changed or its dress code needs confirmation. Reload events.')
        seen.add(key)
        event = events[key]
        # Titles, descriptions, attendees, locations, and meeting links are not
        # sent to Anthropic. Only confirmed dress codes and timing influence it.
        context.append({'start': event['start'], 'end': event['end'], 'dressCode': dress})
    return context


def disconnect(user_id):
    record = connection(user_id)
    if record is None:
        return
    credentials = credentials_for(record)
    try:
        response = requests.post('https://oauth2.googleapis.com/revoke',
            data={'token': credentials.refresh_token or credentials.token}, timeout=(3, 10))
        if response.status_code not in (200, 400):
            response.raise_for_status()
        db.session.delete(record)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        raise RecommendationUnavailable('Could not disconnect Google Calendar. Please retry.') from exc
