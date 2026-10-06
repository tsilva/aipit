"""Add a development secret with hidden input and no credential arguments."""

import argparse
import getpass
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
from uuid import UUID
import warnings

ROOT = Path(__file__).resolve().parents[2]
PROJECT_NAME = "aipit"
SECRET_NAMES = (
    "OPENROUTER_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "SENTRY_AUTH_TOKEN",
)


class SetupError(Exception):
    """An error whose fixed message is safe to display."""


def configuration(root):
    try:
        result = json.loads((root / ".bitwarden.local.json").read_text())
        if not isinstance(result, dict):
            raise ValueError()
    except FileNotFoundError:
        result = {}
    except (ValueError, OSError):
        raise SetupError("Could not read .bitwarden.local.json.") from None
    server = os.environ.get("BWS_SERVER_URL") or result.get("serverUrl") or "https://vault.bitwarden.com"
    if server not in ("https://vault.bitwarden.com", "https://vault.bitwarden.eu"):
        raise SetupError("Configure a Bitwarden US or EU server URL.")
    return result, server


def discover_project(token, server, configured_id):
    try:
        response = subprocess.run(
            ["bws", "project", "list", "--server-url", server, "--output", "json"],
            env={**{key: value for key, value in os.environ.items() if key not in SECRET_NAMES}, "BWS_ACCESS_TOKEN": token, "RUST_LOG": "off"},
            capture_output=True, text=True, timeout=30, check=True,
        )
        projects = json.loads(response.stdout)
        matches = [p for p in projects if p.get("name") == PROJECT_NAME]
        if configured_id:
            matches = [p for p in matches if p.get("id") == configured_id]
        if len(matches) != 1:
            raise SetupError("The token must have access to exactly one aipit project. Check its project permissions and local configuration.")
        project = matches[0]
        UUID(project["id"])
        UUID(project["organizationId"])
        return project
    except SetupError:
        raise
    except Exception:
        # CLI errors and SDK exceptions may contain sensitive response data.
        raise SetupError("Could not find the project. Check that bws is installed and the token has access to aipit on the selected server.") from None


def create_secret(client, project, name, value_prompt):
    try:
        metadata = client.secrets().list(project["organizationId"])
        if not metadata.success or metadata.data is None:
            raise SetupError("Could not inspect existing secret names.")
        for secret in metadata.data.data:
            if secret.key == name and UUID(project["id"]) in secret.project_ids:
                raise SetupError("That key already exists in aipit. It was not overwritten; edit it in the Bitwarden web vault.")
        value = value_prompt(f"{name} value (hidden): ").strip()
        if not value:
            raise SetupError("No value supplied; nothing was added.")
        result = client.secrets().create(
            UUID(project["organizationId"]), name, value,
            "Added through aipit secret setup", [UUID(project["id"])],
        )
        if not result.success or result.data is None:
            raise SetupError("Bitwarden did not confirm creation. Check the web vault before retrying.")
        if result.data.key != name or result.data.project_id != UUID(project["id"]):
            raise SetupError("The response did not confirm the expected destination. Check the web vault before retrying.")
    except SetupError:
        raise
    except Exception:
        raise SetupError("Secret creation failed or its outcome is uncertain. Check the web vault before retrying; the token needs Can read, write permission.") from None


def authenticated_client(token, server):
    from bitwarden_sdk import BitwardenClient, client_settings_from_dict

    suffix = "eu" if server.endswith(".eu") else "com"
    client = BitwardenClient(client_settings_from_dict({
        "apiUrl": f"https://api.bitwarden.{suffix}",
        "identityUrl": f"https://identity.bitwarden.{suffix}",
        "userAgent": "aipit-secret-tools",
    }))
    try:
        login = client.auth().login_access_token(token, None)
        if not login.success or login.data is None or not login.data.authenticated:
            raise SetupError("Bitwarden authentication failed.")
    except Exception:
        raise SetupError("Bitwarden authentication failed. Check the import token and server.") from None
    return client


def save_configuration(root, project, server):
    try:
        (root / ".bitwarden.local.json").write_text(json.dumps({
            "projectId": project["id"], "serverUrl": server,
        }, indent=2) + "\n")
    except OSError:
        raise SetupError("The secret was added, but local project settings could not be saved. Do not repeat the import; configure .bitwarden.local.json manually.") from None
    print("Saved the non-secret project settings for local runs.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", choices=SECRET_NAMES, nargs="?", default="OPENROUTER_API_KEY")
    args = parser.parse_args()
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise SetupError("Run npm run secrets:add in an interactive terminal for hidden input.")
    warnings.simplefilter("error", getpass.GetPassWarning)
    logging.disable(logging.CRITICAL)
    os.environ["RUST_LOG"] = "off"
    settings, server = configuration(ROOT)
    token = getpass.getpass("Bitwarden aipit-import machine token (hidden): ").strip()
    if not token:
        raise SetupError("No token supplied; nothing was added.")
    project = discover_project(token, server, os.environ.get("BWS_PROJECT_ID") or settings.get("projectId"))
    print(f"Destination: {PROJECT_NAME} on {server}")
    client = authenticated_client(token, server)
    create_secret(client, project, args.name, getpass.getpass)
    print(f"Added {args.name}. No credential values were displayed.")
    save_configuration(ROOT, project, server)


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled.", file=sys.stderr)
        sys.exit(1)
    except SetupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Setup failed. No error details were displayed because they may contain credentials.", file=sys.stderr)
        sys.exit(1)
