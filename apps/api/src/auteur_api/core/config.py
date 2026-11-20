from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    # Browsers treat these as different origins even though both are this machine.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("cors_origins")
    @classmethod
    def cors_origins_are_explicit(cls, value: list[str]) -> list[str]:
        cleaned = [origin.strip() for origin in value if origin.strip()]
        if any(origin == "*" for origin in cleaned):
            raise ValueError(
                "CORS origins must be explicit. "
                "A wildcard is not allowed with credentials."
            )
        return cleaned

    # AI provider (server-side only; never exposed to the frontend). BR-SEC-001.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4.1"
    openai_reasoning_effort: str | None = None
    openai_timeout_seconds: float = 240.0
    blueprint_web_search: bool = True
    research_search_context_size: str = "medium"

    # Demo-only generation limits (DEC-007). None builds the whole Blueprint.
    generation_max_modules: int | None = 1
    generation_max_attempts: int = 3  # BR-GEN-008

    # Technical safety/cost limit for free-text inputs; not a business rule.
    max_free_text_chars: int = 4000

    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None

    # Stripe sandbox. Price ids live on offer versions, not in these settings.
    stripe_secret_key: SecretStr | None = None
    stripe_webhook_secret: SecretStr | None = None
    commercial_gate_enabled: bool = False
    public_site_url: str = "http://localhost:3000"

    # Lesson narration (DEC-024). Secrets stay on the API. Mock is development only.
    tts_enabled: bool = True
    tts_provider: str = "mock"
    tts_allow_mock: bool = False
    tts_model: str = "eleven_multilingual_v2"
    tts_voice_id: str = "mock-voice"
    tts_output_format: str = "mp3_44100_128"
    tts_max_input: int | None = None
    tts_max_active_jobs_per_user: int = 1
    tts_lease_seconds: int = 120
    tts_monthly_unit_cap: int = 0
    tts_max_chunk_attempts: int = 3
    tts_signed_url_seconds: int = 300
    elevenlabs_api_key: SecretStr | None = None
    elevenlabs_base_url: str = "https://api.elevenlabs.io"
    cron_secret: SecretStr | None = None

    @field_validator(
        "openai_api_key",
        "supabase_service_role_key",
        "stripe_secret_key",
        "stripe_webhook_secret",
        "elevenlabs_api_key",
        "cron_secret",
        mode="before",
    )
    @classmethod
    def empty_secret_is_none(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("commercial_gate_enabled", mode="before")
    @classmethod
    def blank_gate_is_off(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return False
        return value

    @field_validator("public_site_url")
    @classmethod
    def strip_site_url(cls, value: str) -> str:
        return value.strip().rstrip("/")

    @field_validator("tts_max_input", mode="before")
    @classmethod
    def blank_max_input_is_none(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def diagnostics_enabled(self) -> bool:
        # DEC-005: internal generation data is only observable outside production.
        return not self.is_production

    @property
    def demo_commercial_bypass_enabled(self) -> bool:
        # DEC-003 / BR-BLP-001 / BR-SUB-003: subscription and entitlement checks
        # are not implemented. Gating them on APP_ENV=production rejects every
        # Blueprint, including an authenticated learner, and Try again repeats
        # DEC-003 keeps generation open. COMMERCIAL_GATE_ENABLED is the separate
        # credit hold, and it stays off until that journey is decided (DEC-023).
        return True

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def mock_tts_permitted(self) -> bool:
        # Production never serves the mock, even if TTS_ALLOW_MOCK is true.
        return not self.is_production

    @property
    def has_openai_api_key(self) -> bool:
        return self.openai_api_key is not None


settings = Settings()
