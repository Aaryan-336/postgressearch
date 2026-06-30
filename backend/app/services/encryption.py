"""Fernet symmetric encryption for database credentials at rest.

All credential fields (host, port, database, username, password) are
encrypted before storage and decrypted only at query execution time.
The encryption key is loaded from the FERNET_KEY environment variable.
"""

import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

logger = logging.getLogger(__name__)

_cipher: Fernet | None = None


def _get_cipher() -> Fernet:
    """Get or create the Fernet cipher instance."""
    global _cipher
    if _cipher is None:
        settings = get_settings()
        if not settings.fernet_key:
            raise RuntimeError(
                "FERNET_KEY is not set. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _cipher = Fernet(settings.fernet_key.encode())
    return _cipher


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string and return base64-encoded ciphertext.

    Args:
        plaintext: The string to encrypt.

    Returns:
        Base64-encoded encrypted string.
    """
    cipher = _get_cipher()
    return cipher.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext string.

    Args:
        ciphertext: The encrypted string to decrypt.

    Returns:
        The original plaintext string.

    Raises:
        ValueError: If the ciphertext is invalid or the key is wrong.
    """
    cipher = _get_cipher()
    try:
        return cipher.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        logger.error("Failed to decrypt credential — invalid token or wrong key")
        raise ValueError("Failed to decrypt credential. The encryption key may have changed.") from e


def generate_key() -> str:
    """Generate a new Fernet key for initial setup.

    Returns:
        A URL-safe base64-encoded 32-byte key.
    """
    return Fernet.generate_key().decode("utf-8")
