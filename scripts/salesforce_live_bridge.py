#!/usr/bin/env python3
"""Poll a Salesforce Developer Edition org and forward changed records into
this app's /integrations/inbound/{provider_code} endpoint, so the
Integrations module gets a genuine real-time (near-real-time) external feed
instead of synthetic data.

Setup:
  1. Sign up for a free org at https://developer.salesforce.com/signup
  2. Setup > App Manager > New Connected App. Enable OAuth Settings, add the
     "Manage user data via APIs (api)" scope. Save and note Consumer Key/Secret.
  3. Setup > Users > (your user) > Reset Security Token, check email.
  4. Put a few records in the object you want to stream (e.g. Opportunity),
     or bulk-load a free dataset (Olist/Online Retail) via Data Import Wizard.

Env vars:
  SF_LOGIN_URL       default https://login.salesforce.com
  SF_CLIENT_ID       Connected App consumer key
  SF_CLIENT_SECRET   Connected App consumer secret
  SF_USERNAME        Salesforce login (email)
  SF_PASSWORD        Salesforce password
  SF_SECURITY_TOKEN  Security token (appended to password for auth)
  SF_OBJECT          sObject to poll, default "Opportunity"
  SF_FIELDS          comma-separated fields to pull, default "Id,Name,StageName,Amount,CloseDate,LastModifiedDate"
  SF_POLL_SECONDS    poll interval, default 15
  APP_BASE_URL       this app's base URL, default http://localhost:8000
  APP_PROVIDER_CODE  provider_code to register/use, default "SALESFORCE_DEV"
  APP_COMPANY_ID     company_id to attach inbound events to, default "company-c"

Run:
  python scripts/salesforce_live_bridge.py
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone

import httpx

SF_LOGIN_URL = os.getenv("SF_LOGIN_URL", "https://login.salesforce.com")
SF_CLIENT_ID = os.getenv("SF_CLIENT_ID", "")
SF_CLIENT_SECRET = os.getenv("SF_CLIENT_SECRET", "")
SF_USERNAME = os.getenv("SF_USERNAME", "")
SF_PASSWORD = os.getenv("SF_PASSWORD", "")
SF_SECURITY_TOKEN = os.getenv("SF_SECURITY_TOKEN", "")
SF_OBJECT = os.getenv("SF_OBJECT", "Opportunity")
SF_FIELDS = os.getenv("SF_FIELDS", "Id,Name,StageName,Amount,CloseDate,LastModifiedDate")
SF_POLL_SECONDS = float(os.getenv("SF_POLL_SECONDS", "15"))

APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")
APP_PROVIDER_CODE = os.getenv("APP_PROVIDER_CODE", "SALESFORCE_DEV")
APP_COMPANY_ID = os.getenv("APP_COMPANY_ID", "company-c")

REQUIRED_ENV = ["SF_CLIENT_ID", "SF_CLIENT_SECRET", "SF_USERNAME", "SF_PASSWORD"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def salesforce_login(client: httpx.Client) -> tuple[str, str]:
    response = client.post(
        f"{SF_LOGIN_URL}/services/oauth2/token",
        data={
            "grant_type": "password",
            "client_id": SF_CLIENT_ID,
            "client_secret": SF_CLIENT_SECRET,
            "username": SF_USERNAME,
            "password": f"{SF_PASSWORD}{SF_SECURITY_TOKEN}",
        },
    )
    response.raise_for_status()
    body = response.json()
    return body["access_token"], body["instance_url"]


def soql_query(client: httpx.Client, instance_url: str, access_token: str, since_iso: str | None) -> list[dict]:
    where_clause = f" WHERE LastModifiedDate > {since_iso}" if since_iso else ""
    soql = f"SELECT {SF_FIELDS} FROM {SF_OBJECT}{where_clause} ORDER BY LastModifiedDate ASC LIMIT 200"
    response = client.get(
        f"{instance_url}/services/data/v60.0/query",
        params={"q": soql},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    response.raise_for_status()
    return response.json().get("records", [])


def ensure_provider_registered(app_client: httpx.Client) -> None:
    providers = app_client.get(f"{APP_BASE_URL}/integrations/providers").json()
    existing = providers.get("data") if isinstance(providers, dict) else providers
    codes = {row.get("provider_code") for row in existing} if isinstance(existing, list) else set()
    if APP_PROVIDER_CODE in codes:
        return
    app_client.post(
        f"{APP_BASE_URL}/integrations/providers",
        json={
            "provider_code": APP_PROVIDER_CODE,
            "provider_name": "Salesforce Developer Edition",
            "provider_type": "CRM",
            "description": "Live bridge polling a free Salesforce dev org.",
            "auth_type": "OAuth",
        },
    ).raise_for_status()


def forward_record(app_client: httpx.Client, record: dict) -> None:
    record_id = record["Id"]
    last_modified = record.get("LastModifiedDate", utc_now_iso())
    response = app_client.post(
        f"{APP_BASE_URL}/integrations/inbound/{APP_PROVIDER_CODE}",
        json={
            "company_id": APP_COMPANY_ID,
            "source_module": "Sales",
            "event_type": f"{SF_OBJECT}.upserted",
            "entity_type": SF_OBJECT,
            "entity_id": record_id,
            "payload_json": {k: v for k, v in record.items() if k != "attributes"},
            "idempotency_key": f"{record_id}:{last_modified}",
        },
    )
    response.raise_for_status()


def main() -> int:
    missing = [name for name in REQUIRED_ENV if not os.getenv(name)]
    if missing:
        print(f"Missing required env vars: {', '.join(missing)}", file=sys.stderr)
        return 1

    with httpx.Client(timeout=30) as sf_client, httpx.Client(timeout=30) as app_client:
        access_token, instance_url = salesforce_login(sf_client)
        ensure_provider_registered(app_client)
        print(f"Connected to {instance_url}; polling {SF_OBJECT} every {SF_POLL_SECONDS}s", flush=True)

        since_iso: str | None = None
        while True:
            records = soql_query(sf_client, instance_url, access_token, since_iso)
            for record in records:
                forward_record(app_client, record)
                since_iso = record.get("LastModifiedDate", since_iso)
            if records:
                print(f"{utc_now_iso()} forwarded {len(records)} {SF_OBJECT} record(s), checkpoint={since_iso}", flush=True)
            time.sleep(SF_POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
