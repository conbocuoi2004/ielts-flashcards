"""Initialize a new deployment's private database password without logging it."""
import os
from pathlib import Path
import secrets
import subprocess


def initialize(directory, project, run=subprocess.run):
    env_path = Path(directory) / '.env'
    content = env_path.read_text() if env_path.exists() else ''
    password_lines = [line for line in content.splitlines() if line.strip().startswith('POSTGRES_PASSWORD=')]
    if password_lines and password_lines[-1].split('=', 1)[1].strip().strip("\"'"):
        return False
    # An initialized database requires its original password, never a new random one.
    found = run(['docker', 'volume', 'inspect', f'{project}_postgres_data'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if found.returncode == 0:
        raise RuntimeError('PostgreSQL volume already exists. Restore its POSTGRES_PASSWORD in the server .env before deploying.')
    # Verify Docker is reachable: a daemon error must not be treated as a missing volume.
    run(['docker', 'info'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    content = '\n'.join(line for line in content.splitlines()
                        if not line.strip().startswith('POSTGRES_PASSWORD='))
    if content:
        content += '\n'
    content += f'POSTGRES_PASSWORD={secrets.token_hex(32)}\n'
    if not any(line.strip().startswith('COOKIE_SECURE=') for line in content.splitlines()):
        content += 'COOKIE_SECURE=true\n'
    # Never publish the file or password as a workflow output/artifact.
    descriptor = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(content)
    return True


if __name__ == '__main__':
    initialize(Path.cwd(), os.environ.get('COMPOSE_PROJECT_NAME', Path.cwd().name))
