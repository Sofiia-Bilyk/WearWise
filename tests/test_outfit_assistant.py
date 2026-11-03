"""Assistant logic with real auth/DB/encryption, mocked providers, and no paid calls."""
import json
import logging
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs
from unittest.mock import Mock
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet
from google.oauth2.credentials import Credentials
import pytest

from wearwise_app.models import db, User, Item, Outfit, OutfitItem, GoogleCalendarConnection
from wearwise_app.services import recommendation_weather as weather
from wearwise_app.services import recommendation_calendar as calendar
from wearwise_app.services import outfit_recommendations as recommendations
from wearwise_app.routes import outfit_assistant as routes
from wearwise_app.services.exceptions import ValidationError

ORIGIN = {'Origin': 'http://localhost:3000'}
CITY = {'id': 123, 'name': 'Test City', 'region': 'Region', 'country': 'Country',
        'timezone': 'America/Los_Angeles', 'latitude': 34.05, 'longitude': -118.25}


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def block(*args, **kwargs):
        raise AssertionError('Unexpected external request in an offline test')
    monkeypatch.setattr('requests.sessions.Session.request', block)
    monkeypatch.setattr(recommendations.anthropic, 'Anthropic', block)
    city_cache, forecast_cache = weather._city, weather._forecast
    city_cache.cache_clear()
    forecast_cache.cache_clear()
    yield
    city_cache.cache_clear()
    forecast_cache.cache_clear()


@pytest.fixture
def advisor(client, app):
    app.config.update(FRONTEND_URL='http://localhost:3000', ANTHROPIC_API_KEY='test-only-key',
        ANTHROPIC_MODEL='test-model', ANTHROPIC_WORKSPACE_ID='', GOOGLE_CLIENT_ID='test-client',
        GOOGLE_CLIENT_SECRET='test-only-secret', CALENDAR_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode(),
        GOOGLE_REDIRECT_URI='http://localhost:3000/api/calendar/google/callback')
    db.session.add(User(id=1, email='private-account@example.com', password_hash='unused'))
    db.session.commit()
    with client.session_transaction() as session:
        session['user_id'] = 1
    return client


def current_day():
    return datetime.now(ZoneInfo(CITY['timezone'])).date()


def add_item(name, category='Top', days=40, owner=1, **kwargs):
    item = Item(user_id=owner, name=name, category=category, color='Blue',
                created_at=datetime.combine(current_day() - timedelta(days=days), datetime.min.time()), **kwargs)
    db.session.add(item)
    db.session.flush()
    return item


def seed_look():
    items = [add_item('Forgotten shirt'), add_item('Trousers', 'Bottom'), add_item('Shoes', 'Shoes')]
    db.session.commit()
    return items


def model_output(items):
    return {'looks': [{'title': 'A practical look', 'itemIds': [str(item.id) for item in items],
        'weatherReason': 'A layer can help later.', 'calendarReason': 'Fits the selected dress code.',
        'forgottenReason': 'Rediscover an unworn piece.'}], 'notes': []}


def model_mock(monkeypatch, output, stop='end_turn'):
    create = Mock(return_value=SimpleNamespace(stop_reason=stop,
        content=[SimpleNamespace(type='text', text=json.dumps(output))]))
    client = Mock()
    client.__enter__ = Mock(return_value=client)
    client.__exit__ = Mock(return_value=False)
    client.messages.create = create
    factory = Mock(return_value=client)
    monkeypatch.setattr(recommendations.anthropic, 'Anthropic', factory)
    return factory, create


def request_data(**overrides):
    return {'cityId': CITY['id'], 'date': current_day().isoformat(),
            'selectedEvents': [], 'shareWithAnthropic': True, **overrides}


def context_mocks(monkeypatch):
    monkeypatch.setattr(routes, 'get_city', lambda value: CITY)
    monkeypatch.setattr(recommendations, 'get_forecast', lambda *args: {'hours': [], 'timezone': CITY['timezone']})


def credentials(expired=False):
    return Credentials(token='secret-access-token', refresh_token='secret-refresh-token',
        token_uri='https://oauth2.googleapis.com/token', client_id='test-client', client_secret='test-only-secret',
        scopes=[calendar.SCOPE], expiry=datetime.utcnow() + timedelta(hours=-1 if expired else 1))


def connected(expired=False):
    record = GoogleCalendarConnection(user_id=1,
        encrypted_credentials=calendar.encrypt_credentials(credentials(expired)))
    db.session.add(record)
    db.session.commit()
    return record


def event():
    return {'id': 'event-1', 'summary': 'PRIVATE BOARD MEETING',
            'description': 'PRIVATE DESCRIPTION', 'attendees': [{'email': 'private@example.com'}],
            'start': {'dateTime': current_day().isoformat() + 'T09:00:00-08:00'},
            'end': {'dateTime': current_day().isoformat() + 'T10:00:00-08:00'}}


def response(data, code=200):
    result = Mock(status_code=code)
    result.json.return_value = data
    if code >= 400:
        import requests
        result.raise_for_status.side_effect = requests.HTTPError('provider failure')
    return result


def test_status_is_private_and_requires_auth(advisor, app):
    assert app.test_client().get('/outfit-assistant/status').status_code == 401
    result = advisor.get('/outfit-assistant/status')
    assert result.json == {'aiReady': True, 'calendarReady': True, 'calendarConnected': False}
    assert result.headers['Cache-Control'] == 'no-store'
    assert 'test-only-key' not in result.text


def test_missing_configuration_is_reported_without_provider_calls(advisor, app):
    app.config.update(ANTHROPIC_API_KEY='', GOOGLE_CLIENT_SECRET='')
    result = advisor.get('/outfit-assistant/status').json
    assert result['aiReady'] is False and result['calendarReady'] is False


@pytest.mark.parametrize('origin', [None, 'https://untrusted.example'])
def test_mutations_require_origin(advisor, origin):
    result = advisor.post('/calendar/google/connect', json={}, headers={} if origin is None else {'Origin': origin})
    assert result.status_code == 400


def test_oversized_generation_is_rejected(advisor):
    result = advisor.post('/outfit-assistant/recommendations', data='x' * 20000,
                          content_type='application/json', headers=ORIGIN)
    assert result.status_code == 413


def test_forgotten_threshold_never_worn_postponed_and_future_logs(advisor):
    old = add_item('Old', days=31)
    boundary = add_item('Boundary', days=30)
    postponed = add_item('Postponed', postponed_until=current_day() + timedelta(days=1))
    future = add_item('Future wear')
    outfit = Outfit(user_id=1, worn_date=current_day() + timedelta(days=2))
    db.session.add(outfit)
    db.session.add(OutfitItem(item=future, outfit=outfit))
    db.session.commit()
    pool, _ = recommendations.wardrobe_context(1, current_day(), CITY['timezone'])
    flags = {entry['id']: entry for entry in pool}
    assert flags[str(old.id)]['forgotten'] is True
    assert flags[str(boundary.id)]['forgotten'] is False
    assert flags[str(postponed.id)]['forgotten'] is False
    assert flags[str(future.id)]['forgotten'] is True


def test_candidate_pool_is_owner_scoped_active_and_bounded(advisor):
    db.session.add(User(id=2, email='other@example.com', password_hash='unused'))
    db.session.flush()
    foreign = add_item('Foreign', owner=2)
    archived = add_item('Archived', archived_at=datetime.utcnow())
    for index in range(20):
        add_item(f'Top {index}')
    shoes = add_item('Shoes', 'Shoes')
    db.session.commit()
    pool, _ = recommendations.wardrobe_context(1, current_day(), CITY['timezone'])
    assert len([entry for entry in pool if entry['category'] == 'Top']) == 16
    assert str(shoes.id) in {entry['id'] for entry in pool}
    assert not {str(foreign.id), str(archived.id)} & {entry['id'] for entry in pool}


def test_generate_uses_only_approved_context_and_never_saves_an_outfit(advisor, monkeypatch):
    items = seed_look()
    context_mocks(monkeypatch)
    connected()
    monkeypatch.setattr(calendar.requests, 'get', Mock(return_value=response({'items': [event()]})))
    factory, create = model_mock(monkeypatch, model_output(items))
    result = advisor.post('/outfit-assistant/recommendations', json=request_data(
        selectedEvents=[{'id': 'event-1', 'dressCode': 'professional'}]), headers=ORIGIN)
    assert result.status_code == 200, result.json
    context = json.loads(create.call_args.kwargs['messages'][0]['content'])
    assert set(context) == {'date', 'weather', 'calendar', 'wardrobe'}
    serialized = json.dumps(context)
    for private in ['PRIVATE', 'secret-access-token', 'secret-refresh-token', 'private-account@example.com', 'attendees', 'latitude', 'image', 'cost', 'brand']:
        assert private not in serialized
    assert context['calendar'][0]['dressCode'] == 'professional'
    assert set(context['calendar'][0]) == {'start', 'end', 'dressCode'}
    assert factory.call_args.kwargs['max_retries'] == 0
    assert create.call_count == 1
    assert db.session.query(Outfit).count() == 0
    assert db.session.query(Item).count() == 3
    assert result.json['looks'][0]['forgottenItemIds']


def test_generation_requires_explicit_sharing_and_model_configuration(advisor, monkeypatch, app):
    context_mocks(monkeypatch)
    result = advisor.post('/outfit-assistant/recommendations', json=request_data(shareWithAnthropic=False), headers=ORIGIN)
    assert result.status_code == 400
    app.config['ANTHROPIC_API_KEY'] = ''
    assert advisor.post('/outfit-assistant/recommendations', json=request_data(), headers=ORIGIN).status_code == 503


@pytest.mark.parametrize('mode', ['foreign', 'repeated', 'incomplete', 'duplicate_looks', 'too_many', 'bad_note', 'bad_shape'])
def test_invalid_model_results_are_rejected(advisor, monkeypatch, mode):
    items = seed_look()
    context_mocks(monkeypatch)
    output = model_output(items)
    if mode == 'foreign': output['looks'][0]['itemIds'][0] = '999999'
    elif mode == 'repeated': output['looks'][0]['itemIds'][1] = str(items[0].id)
    elif mode == 'incomplete': output['looks'][0]['itemIds'].pop()
    elif mode == 'duplicate_looks': output['looks'] *= 2
    elif mode == 'too_many': output['looks'] *= 4
    elif mode == 'bad_note': output['notes'] = ['x' * 501]
    else: output['unexpected'] = True
    model_mock(monkeypatch, output)
    result = advisor.post('/outfit-assistant/recommendations', json=request_data(), headers=ORIGIN)
    assert result.status_code == 503
    assert db.session.query(Outfit).count() == 0


@pytest.mark.parametrize('stop', ['max_tokens', 'refusal'])
def test_truncation_and_refusal_are_not_displayed_as_valid(advisor, monkeypatch, stop):
    items = seed_look()
    context_mocks(monkeypatch)
    model_mock(monkeypatch, model_output(items), stop)
    assert advisor.post('/outfit-assistant/recommendations', json=request_data(), headers=ORIGIN).status_code == 503


def test_archived_item_during_inference_is_rejected(advisor, monkeypatch):
    items = seed_look()
    context_mocks(monkeypatch)
    _, create = model_mock(monkeypatch, model_output(items))
    def archive(**kwargs):
        items[0].archived_at = datetime.utcnow()
        db.session.commit()
        return SimpleNamespace(stop_reason='end_turn', content=[SimpleNamespace(type='text', text=json.dumps(model_output(items)))])
    create.side_effect = archive
    assert advisor.post('/outfit-assistant/recommendations', json=request_data(), headers=ORIGIN).status_code == 503


def test_missing_categories_explained_without_calling_ai(advisor, monkeypatch):
    context_mocks(monkeypatch)
    result = advisor.post('/outfit-assistant/recommendations', json=request_data(), headers=ORIGIN)
    assert result.status_code == 200
    assert result.json['looks'] == []
    assert 'Shoes' in result.json['notes'][0]


def test_no_calendar_or_forgotten_context_cannot_get_false_badges(advisor, monkeypatch):
    items = [add_item('Top', days=1), add_item('Bottom', 'Bottom', days=1), add_item('Shoes', 'Shoes', days=1)]
    db.session.commit()
    context_mocks(monkeypatch)
    model_mock(monkeypatch, model_output(items))
    result = advisor.post('/outfit-assistant/recommendations', json=request_data(), headers=ORIGIN)
    assert result.json['looks'][0]['forgottenItemIds'] == []
    assert result.json['looks'][0]['calendarReason'] == 'No calendar events selected.'


def test_city_lookup_validation_and_timezone(advisor, monkeypatch):
    fetch = Mock(side_effect=[{'results': [CITY]}, CITY])
    monkeypatch.setattr(weather, 'get_json', fetch)
    assert weather.search_locations('Test')[0]['timezone'] == CITY['timezone']
    assert weather.get_city(123)['name'] == 'Test City'
    for value in [True, -1, '123']:
        with pytest.raises(ValidationError): weather.get_city(value)
    with pytest.raises(ValidationError): weather.search_locations('x')


def forecast(day, count=24):
    return {'hourly': {'time': [f'{day}T{index:02}:00' for index in range(count)],
        'temperature_2m': [18] * count, 'apparent_temperature': [17] * count,
        'precipitation_probability': [35] * count, 'wind_speed_10m': [12] * count,
        'relative_humidity_2m': [60] * count}}


def test_full_day_forecast_units_cache_and_no_private_data(advisor, monkeypatch):
    monkeypatch.setattr(weather, '_city', lambda value: CITY)
    fetch = Mock(return_value=forecast(current_day().isoformat()))
    monkeypatch.setattr(weather, 'get_json', fetch)
    first = weather.get_forecast(CITY, current_day())
    second = weather.get_forecast(CITY, current_day())
    assert first == second and fetch.call_count == 1
    assert len(first['hours']) == 24
    params = fetch.call_args.args[1]
    assert params['temperature_unit'] == 'celsius' and params['wind_speed_unit'] == 'kmh'
    assert 'relative_humidity_2m' in params['hourly']
    assert first['hours'][0]['time'].endswith('00:00')


@pytest.mark.parametrize('mode', ['short', 'null', 'nan'])
def test_incomplete_weather_is_not_invented(advisor, monkeypatch, mode):
    monkeypatch.setattr(weather, '_city', lambda value: CITY)
    data = forecast(current_day().isoformat(), 2 if mode == 'short' else 24)
    if mode != 'short': data['hourly']['temperature_2m'][0] = None if mode == 'null' else float('nan')
    monkeypatch.setattr(weather, 'get_json', lambda *args: data)
    with pytest.raises(weather.RecommendationUnavailable): weather.get_forecast(CITY, current_day())


def test_recommendation_window_is_city_local(advisor):
    today = current_day()
    assert weather.recommendation_day(today.isoformat(), CITY) == today
    assert weather.recommendation_day((today + timedelta(days=6)).isoformat(), CITY) == today + timedelta(days=6)
    for value in [(today - timedelta(days=1)).isoformat(), (today + timedelta(days=7)).isoformat(), 'invalid']:
        with pytest.raises(ValidationError): weather.recommendation_day(value, CITY)


def test_google_connect_uses_read_only_scope_state_and_pkce(advisor):
    result = advisor.post('/calendar/google/connect', json={}, headers=ORIGIN)
    assert result.status_code == 200
    query = parse_qs(urlsplit(result.json['url']).query)
    assert query['scope'] == [calendar.SCOPE]
    assert query['code_challenge_method'] == ['S256']
    assert query['access_type'] == ['offline']
    with advisor.session_transaction() as session:
        flow = session['google_calendar_flow']
        assert flow['state'] == query['state'][0] and flow['owner'] == 1 and flow['verifier']
        assert 'token' not in flow


def begin_flow(client):
    client.post('/calendar/google/connect', json={}, headers=ORIGIN)
    with client.session_transaction() as session: return session['google_calendar_flow']['state']


def test_callback_encrypts_tokens_and_does_not_store_client_secret(advisor, monkeypatch):
    state = begin_flow(advisor)
    oauth = SimpleNamespace(credentials=credentials(), fetch_token=Mock(),
                            oauth2session=SimpleNamespace(token={'scope': calendar.SCOPE}))
    monkeypatch.setattr(calendar, 'flow', lambda **kwargs: oauth)
    result = advisor.get('/calendar/google/callback', query_string={'state': state, 'code': 'test-code'})
    assert result.status_code == 302 and 'calendar=connected' in result.location
    record = db.session.get(GoogleCalendarConnection, 1)
    assert 'secret-access-token' not in record.encrypted_credentials
    stored = json.loads(calendar.cipher().decrypt(record.encrypted_credentials.encode()))
    assert stored['refresh_token'] == 'secret-refresh-token'
    assert 'client_secret' not in stored
    with advisor.session_transaction() as session: assert 'google_calendar_flow' not in session


@pytest.mark.parametrize('mode', ['wrong_state', 'expired', 'owner', 'denied'])
def test_bad_oauth_callback_never_connects(advisor, mode):
    state = begin_flow(advisor)
    with advisor.session_transaction() as session:
        saved = session['google_calendar_flow']
        if mode == 'expired': saved['expires'] = 0
        if mode == 'owner': saved['owner'] = 2
        session['google_calendar_flow'] = saved
    args = {'state': 'bad' if mode == 'wrong_state' else state, 'code': 'test-code'}
    if mode == 'denied': args['error'] = 'access_denied'
    result = advisor.get('/calendar/google/callback', query_string=args)
    assert 'calendar=failed' in result.location
    assert db.session.get(GoogleCalendarConnection, 1) is None


def test_calendar_event_scope_and_dst_day_boundaries(advisor, monkeypatch):
    connected()
    fetch = Mock(return_value=response({'items': [event()]}))
    monkeypatch.setattr(calendar.requests, 'get', fetch)
    events = calendar.list_events(1, date(2026, 11, 1), 'America/Los_Angeles')
    assert 'attendees' not in events[0] and 'description' not in events[0]
    params = fetch.call_args.kwargs['params']
    start, end = map(datetime.fromisoformat, (params['timeMin'], params['timeMax']))
    assert (end.astimezone(timezone.utc) - start.astimezone(timezone.utc)).total_seconds() == 25 * 3600
    assert '/primary/events' in fetch.call_args.args[0]


def test_refresh_updates_encrypted_credentials(advisor, monkeypatch):
    connected(expired=True)
    def renew(value):
        value.token = 'rotated-secret-token'
        value.expiry = datetime.utcnow() + timedelta(hours=1)
    monkeypatch.setattr(calendar, 'refresh', renew)
    monkeypatch.setattr(calendar.requests, 'get', Mock(return_value=response({'items': []})))
    calendar.list_events(1, current_day(), CITY['timezone'])
    db.session.expire_all()
    stored = db.session.get(GoogleCalendarConnection, 1).encrypted_credentials
    assert 'rotated-secret-token' not in stored
    assert calendar.credentials_for(db.session.get(GoogleCalendarConnection, 1)).token == 'rotated-secret-token'


@pytest.mark.parametrize('choice', [{'id': 'missing', 'dressCode': 'formal'}, {'id': 'event-1', 'dressCode': ''}])
def test_selected_events_require_current_ids_and_confirmed_codes(advisor, monkeypatch, choice):
    monkeypatch.setattr(calendar, 'list_events', lambda *args: [{'id': 'event-1', 'start': {}, 'end': {}}])
    with pytest.raises(ValidationError): calendar.selected_context(1, [choice], current_day(), CITY['timezone'])


def test_disconnect_revokes_and_removes_only_owner_connection(advisor, monkeypatch):
    connected()
    db.session.add(User(id=2, email='second@example.com', password_hash='unused'))
    db.session.add(GoogleCalendarConnection(user_id=2, encrypted_credentials='other-account-record'))
    db.session.commit()
    revoke = Mock(return_value=response({}, 200))
    monkeypatch.setattr(calendar.requests, 'post', revoke)
    assert advisor.post('/calendar/google/disconnect', json={}, headers=ORIGIN).status_code == 200
    assert db.session.get(GoogleCalendarConnection, 1) is None
    assert db.session.get(GoogleCalendarConnection, 2) is not None
    assert revoke.call_args.kwargs['data']['token'] == 'secret-refresh-token'


def test_callback_log_redaction():
    record = logging.LogRecord('werkzeug', logging.INFO, '', 0,
        'GET /calendar/google/callback?code=private-code&state=private-state HTTP/1.1', (), None)
    routes.RedactCalendarCallback().filter(record)
    assert 'private-code' not in record.getMessage() and 'private-state' not in record.getMessage()
