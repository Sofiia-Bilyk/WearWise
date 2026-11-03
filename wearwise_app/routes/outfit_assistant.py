"""Authenticated weather/calendar context and read-only outfit recommendations."""
import logging
import re
from urllib.parse import urlsplit
from flask import Blueprint, current_app, jsonify, request, redirect
from werkzeug.exceptions import HTTPException

from ..auth_guard import require_auth
from ..models import db
from ..services.exceptions import ServiceError, ValidationError
from ..services.recommendation_weather import get_city, search_locations, recommendation_day
from ..services import recommendation_calendar as calendar
from ..services.outfit_recommendations import recommend

assistant_bp = Blueprint('outfit_assistant', __name__)


class RedactCalendarCallback(logging.Filter):
    def filter(self, record):
        # OAuth authorization codes must not appear in development access logs.
        message = record.getMessage()
        if '/calendar/google/callback?' in message:
            record.msg = re.sub(r'(/calendar/google/callback)\?[^\s"]+', r'\1?[redacted]', message)
            record.args = ()
        return True


def frontend_origin():
    parsed = urlsplit(current_app.config['FRONTEND_URL'])
    return f'{parsed.scheme}://{parsed.netloc}'


def body():
    request.max_content_length = 16 * 1024
    # All mutations/generation require same-origin JSON, not third-party forms.
    origin = request.headers.get('Origin')
    if origin != frontend_origin():
        raise ValidationError('Reload WearWise before trying this action again.')
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValidationError('Expected a JSON object.')
    return data


def target(data):
    city = get_city(data.get('cityId'))
    return city, recommendation_day(data.get('date'), city)


@assistant_bp.errorhandler(ServiceError)
def service_error(exc):
    db.session.rollback()
    response = jsonify(error=str(exc))
    response.headers['Cache-Control'] = 'no-store'
    return response, exc.code


@assistant_bp.errorhandler(HTTPException)
def http_error(exc):
    return jsonify(error=exc.description), exc.code


@assistant_bp.errorhandler(Exception)
def unexpected_error(exc):
    db.session.rollback()
    # Avoid recording OAuth tokens, calendar content or model payloads in logs.
    current_app.logger.error('Outfit assistant failed (%s).', type(exc).__name__)
    return jsonify(error='Outfit assistance is temporarily unavailable. Please retry.'), 503


@assistant_bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


@assistant_bp.get('/outfit-assistant/status')
def status():
    user, error = require_auth()
    if error:
        return error
    return jsonify(aiReady=bool(current_app.config.get('ANTHROPIC_API_KEY') and current_app.config.get('ANTHROPIC_MODEL')),
        calendarReady=all(current_app.config.get(key) for key in (
            'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'CALENDAR_TOKEN_ENCRYPTION_KEY')),
        calendarConnected=calendar.connection(user.id) is not None)


@assistant_bp.get('/outfit-assistant/cities')
def cities():
    user, error = require_auth()
    if error:
        return error
    return jsonify(search_locations(request.args.get('q', '')))


@assistant_bp.get('/outfit-assistant/events')
def events():
    user, error = require_auth()
    if error:
        return error
    city, day = target({'cityId': request.args.get('cityId', type=int), 'date': request.args.get('date')})
    return jsonify(calendar.list_events(user.id, day, city['timezone']))


@assistant_bp.post('/calendar/google/connect')
def connect():
    user, error = require_auth()
    if error:
        return error
    body()
    return jsonify(url=calendar.connect_url(user.id))


@assistant_bp.get('/calendar/google/callback')
def callback():
    user, error = require_auth()
    if error:
        return error
    try:
        calendar.finish_connect(user.id, request.args)
        result = 'connected'
    except ServiceError:
        db.session.rollback()
        result = 'failed'
    # Fixed configured destination; never use a user-supplied return URL.
    return redirect(current_app.config['FRONTEND_URL'].rstrip('/') + '/#/insights?calendar=' + result)


@assistant_bp.post('/calendar/google/disconnect')
def disconnect():
    user, error = require_auth()
    if error:
        return error
    body()
    calendar.disconnect(user.id)
    return jsonify(disconnected=True)


@assistant_bp.post('/outfit-assistant/recommendations')
def recommendations():
    user, error = require_auth()
    if error:
        return error
    request.max_content_length = 16 * 1024
    data = body()
    if set(data) != {'cityId', 'date', 'selectedEvents', 'shareWithAnthropic'}:
        raise ValidationError('Unexpected recommendation fields.')
    city, day = target(data)
    return jsonify(recommend(user.id, data, city, day))
