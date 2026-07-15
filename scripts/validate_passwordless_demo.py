#!/usr/bin/env python3
import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def call(base_url: str, path: str, *, method: str = "GET", payload: dict | None = None, token: str | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(f"{base_url.rstrip('/')}{path}", data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:18000"
    status, config = call(base_url, "/runtime/auth/demo-config")
    roles = config.get("data", {}).get("roles", [])
    assert status == 200 and config["data"]["enabled"] is True and len(roles) == 11

    tokens: dict[str, str] = {}
    for item in roles:
        status, login = call(base_url, "/runtime/auth/demo-login", method="POST", payload={"role": item["role"]})
        assert status == 200 and login["data"]["user"]["demo_read_only"] is True
        tokens[item["role"]] = login["data"]["access_token"]

    token = tokens["super_admin"]
    status, session = call(base_url, "/runtime/auth/me", token=token)
    assert status == 200 and session["data"]["demo_read_only"] is True
    status, blocked = call(
        base_url,
        "/runtime/records",
        method="POST",
        token=token,
        payload={
            "module_key": "inventory",
            "record_type": "raw_material",
            "record_code": "DEMO-WRITE-BLOCKED",
            "name": "Must not be created",
            "status": "AVAILABLE",
            "quantity": 1,
            "payload": {},
        },
    )
    assert status == 403 and blocked["detail"] == "Read-only demo sessions cannot modify data."
    print(f"PASS {base_url}: {len(roles)} passwordless roles; GET allowed; writes blocked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
