"""City lookup and hourly forecasts; no exact GPS coordinates are needed."""
from datetime import datetime, date, timedelta
from functools import lru_cache
from time import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import requests
import math

from .exceptions import ServiceError, ValidationError


class RecommendationUnavailable(ServiceError):
    code = 503


def get_json(url, params):
    # Call sites use fixed provider URLs; users cannot supply a target URL.
    try:
        response = requests.get(url, params=params, timeout=(3, 10))
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or data.get('error'):
            raise ValueError('Invalid upstream response')
        return data
    except (requests.RequestException, ValueError) as exc:
        raise RecommendationUnavailable('Weather service is unavailable. Please retry.') from exc


def location_dict(row):
    ZoneInfo(row['timezone'])
    return {'id': row['id'], 'name': row['name'], 'country': row.get('country', ''),
            'region': row.get('admin1', ''), 'timezone': row['timezone'],
            'latitude': row['latitude'], 'longitude': row['longitude']}


def search_locations(query):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 100:
        raise ValidationError('Enter a city name between 2 and 100 characters.')
    data = get_json('https://geocoding-api.open-meteo.com/v1/search',
                    {'name': query.strip(), 'count': 5, 'language': 'en'})
    results = []
    for row in data.get('results', []):
        try:
            results.append(location_dict(row))
        except (KeyError, ValueError, ZoneInfoNotFoundError):
            continue
    return results


@lru_cache(maxsize=128)
def _city(location_id):
    data = get_json('https://geocoding-api.open-meteo.com/v1/get', {'id': location_id})
    try:
        return location_dict(data)
    except (KeyError, ValueError, ZoneInfoNotFoundError) as exc:
        raise ValidationError('Choose a supported city from the search results.') from exc


def get_city(location_id):
    if type(location_id) is not int or not 1 <= location_id <= 2_147_483_647:
        raise ValidationError('Choose a city from the search results.')
    # Resolve coordinates/timezone on the server, rather than trusting client values.
    return _city(location_id)


def recommendation_day(value, city):
    try:
        day = date.fromisoformat(value)
        if day.isoformat() != value:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValidationError('Choose a valid recommendation date.')
    today = datetime.now(ZoneInfo(city['timezone'])).date()
    if not today <= day <= today + timedelta(days=6):
        raise ValidationError('Choose today or a date within the next six days in that city.')
    return day


@lru_cache(maxsize=128)
def _forecast(location_id, day, cache_bucket):
    # Only public weather is cached, never account or calendar information.
    city = get_city(location_id)
    names = ['temperature_2m', 'apparent_temperature', 'precipitation_probability',
             'wind_speed_10m', 'relative_humidity_2m']
    data = get_json('https://api.open-meteo.com/v1/forecast', {
        'latitude': round(city['latitude'], 2), 'longitude': round(city['longitude'], 2),
        'timezone': city['timezone'], 'start_date': day, 'end_date': day,
        'hourly': ','.join(names), 'temperature_unit': 'celsius', 'wind_speed_unit': 'kmh',
    })
    hourly = data.get('hourly', {})
    rows = []
    try:
        for index, timestamp in enumerate(hourly['time']):
            if timestamp[:10] != day:
                continue
            values = [hourly[name][index] for name in names]
            if any(type(value) not in (int, float) or not math.isfinite(value) for value in values):
                raise ValueError('Missing forecast values')
            rows.append(dict(zip(['time', *names], [timestamp, *values])))
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise RecommendationUnavailable('The hourly forecast is incomplete. Please retry.') from exc
    if not 23 <= len(rows) <= 25:
        raise RecommendationUnavailable('No hourly forecast is available for that date.')
    return {'timezone': city['timezone'], 'temperatureUnit': 'C', 'windUnit': 'km/h',
            'hours': rows, 'source': 'Open-Meteo'}


def get_forecast(city, day):
    return _forecast(city['id'], day.isoformat(), int(time() // 600))
