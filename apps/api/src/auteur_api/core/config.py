from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    cors_origins: list[str] = ["http://localhost:3000"]

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

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def diagnostics_enabled(self) -> bool:
        # DEC-005: internal generation data is only observable outside production.
        return not self.is_production

    @property
    def demo_commercial_bypass_enabled(self) -> bool:
        # DEC-003: auth/subscription/entitlement preconditions are skipped in demo.
        return not self.is_production


settings = Settings()
