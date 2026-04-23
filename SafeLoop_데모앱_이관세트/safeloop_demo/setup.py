"""
SafeLoop .env 암호화/복호화 도구.

GitHub public repo에 API 키를 안전하게 싣기 위한 AES-256-GCM + PBKDF2 기반 래퍼.
사용법:
    python setup.py              # 자동 감지(.env 있으면 lock, .env.enc만 있으면 unlock)
    python setup.py lock         # .env → .env.enc (커밋 가능)
    python setup.py unlock       # .env.enc → .env (로컬 실행용)
    python setup.py status       # 현재 파일 상태 확인

암호화 스펙:
  - KDF: PBKDF2-HMAC-SHA256, 390,000 iter, 16-byte salt
  - 암호화: Fernet (AES-128 CBC + HMAC-SHA256) — cryptography 라이브러리 표준
  - 출력 포맷: base64(salt) + "." + fernet_token

주의:
  - 비밀번호는 최소 10자, 영문+숫자+기호 권장
  - 비밀번호는 password manager에 저장 (분실 시 복구 불가)
  - .env 는 절대 커밋되지 않음(.gitignore), .env.enc 만 커밋됨
"""
from __future__ import annotations

import base64
import getpass
import os
import sys
from pathlib import Path

try:
    from cryptography.fernet import Fernet, InvalidToken
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:
    print("필요 패키지가 없습니다.")
    print("  pip install cryptography")
    sys.exit(1)

HERE = Path(__file__).resolve().parent
ENV_PATH = HERE / ".env"
ENC_PATH = HERE / ".env.enc"

SEPARATOR = b"."
ITERATIONS = 390_000
SALT_LEN = 16


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=ITERATIONS,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode("utf-8")))


def encrypt_env() -> int:
    if not ENV_PATH.exists():
        print(f"[오류] {ENV_PATH.name}이 없습니다.")
        print("       먼저 .env 파일에 API 키를 저장한 뒤 다시 실행하세요.")
        return 1

    print("==========================================")
    print("  .env 암호화 (lock)")
    print("==========================================")
    print("이 암호는 다른 컴퓨터에서 복호화(unlock) 할 때 필요합니다.")
    print("분실 시 복구 불가 — password manager에 저장하세요.\n")

    pw1 = getpass.getpass("새 암호 (최소 10자): ").strip()
    if len(pw1) < 10:
        print("[오류] 암호는 10자 이상이어야 합니다.")
        return 1
    pw2 = getpass.getpass("암호 재입력: ").strip()
    if pw1 != pw2:
        print("[오류] 두 번 입력한 암호가 일치하지 않습니다.")
        return 1

    salt = os.urandom(SALT_LEN)
    key = derive_key(pw1, salt)
    token = Fernet(key).encrypt(ENV_PATH.read_bytes())

    output = base64.urlsafe_b64encode(salt) + SEPARATOR + token
    ENC_PATH.write_bytes(output)
    print(f"\n✓ 암호화 완료 → {ENC_PATH.name}  ({len(output)}B)")
    print("\n다음 단계:")
    print("  1) git add safeloop_demo/.env.enc")
    print("  2) git commit -m \"chore: encrypt .env\"")
    print("  3) git push")
    return 0


def decrypt_env() -> int:
    if not ENC_PATH.exists():
        print(f"[오류] {ENC_PATH.name}이 없습니다.")
        print("       git pull로 최신 코드를 받은 뒤 다시 실행하세요.")
        return 1

    print("==========================================")
    print("  .env.enc 복호화 (unlock)")
    print("==========================================")
    pw = getpass.getpass("암호: ").strip()
    if not pw:
        print("[오류] 암호를 입력하세요.")
        return 1

    data = ENC_PATH.read_bytes()
    try:
        salt_b64, token = data.split(SEPARATOR, 1)
        salt = base64.urlsafe_b64decode(salt_b64)
    except Exception:
        print("[오류] 파일 포맷이 올바르지 않습니다 (손상된 .env.enc)")
        return 1

    key = derive_key(pw, salt)
    try:
        plain = Fernet(key).decrypt(token)
    except InvalidToken:
        print("[오류] 복호화 실패 — 암호가 틀렸거나 파일이 손상되었습니다.")
        return 1

    if ENV_PATH.exists():
        backup = HERE / ".env.backup"
        ENV_PATH.rename(backup)
        print(f"  기존 .env → {backup.name} 으로 백업")

    ENV_PATH.write_bytes(plain)
    print(f"\n✓ 복호화 완료 → {ENV_PATH.name}")
    print("\n다음 단계:")
    print("  python -m streamlit run app.py")
    return 0


def status() -> int:
    print("==========================================")
    print("  SafeLoop 환경 파일 상태")
    print("==========================================")
    env_ok = ENV_PATH.exists()
    enc_ok = ENC_PATH.exists()
    mark = lambda v: "✓" if v else "×"
    print(f"  {mark(env_ok)}  .env      (로컬 실행용, 커밋 안 됨)")
    print(f"  {mark(enc_ok)}  .env.enc  (암호화본, 커밋 대상)")
    if env_ok and not enc_ok:
        print("\n→ `python setup.py lock` 으로 암호화하세요.")
    elif enc_ok and not env_ok:
        print("\n→ `python setup.py unlock` 으로 복호화하세요.")
    elif env_ok and enc_ok:
        print("\n둘 다 존재 — 필요 시 암호화 갱신(lock) 하세요.")
    else:
        print("\n.env 가 없습니다. 먼저 .env 파일에 API 키를 저장하세요.")
    return 0


def main() -> int:
    cmd = (sys.argv[1] if len(sys.argv) > 1 else "").lower().strip()
    if cmd in ("lock", "encrypt"):
        return encrypt_env()
    if cmd in ("unlock", "decrypt"):
        return decrypt_env()
    if cmd in ("status", "info"):
        return status()

    # 자동 감지
    if not ENV_PATH.exists() and ENC_PATH.exists():
        print("[자동] .env.enc만 발견 → unlock 진행")
        return decrypt_env()
    if ENV_PATH.exists() and not ENC_PATH.exists():
        print("[자동] .env만 발견 → lock 진행")
        return encrypt_env()

    print("사용법:")
    print("  python setup.py lock      # .env → .env.enc")
    print("  python setup.py unlock    # .env.enc → .env")
    print("  python setup.py status    # 상태 확인")
    return 1


if __name__ == "__main__":
    sys.exit(main())
