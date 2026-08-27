import os
import httpx
from typing import Dict, Any, Optional

class SmartLLMFallbackManager:
    """
    Manages LLM API calls with automatic failover mechanism across multiple providers.
    Sequence: Gemini 1 -> Gemini 2 -> OpenRouter 1 -> Backup (OpenRouter)
    """

    @staticmethod
    async def generate_response(
        prompt: str, 
        system_prompt: Optional[str] = None, 
        temperature: float = 0.2
    ) -> Dict[str, Any]:
        
        # 1. Retrieve all API keys from environment
        gemini_key_1 = os.environ.get("GEMINI_API_KEY_1")
        gemini_key_2 = os.environ.get("GEMINI_API_KEY_2")
        openrouter_key_1 = os.environ.get("OPENROUTER_API_KEY_1")
        backup_key = os.environ.get("BACKUP_API_KEY")

        # Define providers in order of fallback
        providers = []
        if gemini_key_1:
            providers.append({
                "name": "Gemini Primary",
                "type": "gemini",
                "key": gemini_key_1,
                "model": "gemini-2.5-flash",
                "url": f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key_1}"
            })
        if gemini_key_2:
            providers.append({
                "name": "Gemini Secondary",
                "type": "gemini",
                "key": gemini_key_2,
                "model": "gemini-2.5-flash",
                "url": f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key_2}"
            })
        if openrouter_key_1:
            providers.append({
                "name": "OpenRouter Primary",
                "type": "openrouter",
                "key": openrouter_key_1,
                "model": "openai/gpt-4o-mini",
                "url": "https://openrouter.ai/api/v1/chat/completions"
            })
        if backup_key:
            # Backup key is typically an OpenRouter key starting with sk-or-
            providers.append({
                "name": "Backup Provider",
                "type": "openrouter",
                "key": backup_key,
                "model": "openai/gpt-4o-mini",
                "url": "https://openrouter.ai/api/v1/chat/completions"
            })

        if not providers:
            raise ValueError("No LLM API keys configured in the environment (.env file).")

        errors = []
        # 2. Cycle through providers
        for provider in providers:
            try:
                print(f"[SmartLLM] Attempting generation with {provider['name']}...")
                if provider["type"] == "gemini":
                    # Format Gemini API Request
                    payload = {
                        "contents": [
                            {
                                "parts": [
                                    {"text": prompt}
                                ]
                            }
                        ],
                        "generationConfig": {
                            "temperature": temperature
                        }
                    }
                    if system_prompt:
                        payload["systemInstruction"] = {
                            "parts": [
                                {"text": system_prompt}
                            ]
                        }
                    
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.post(provider["url"], json=payload)
                        if response.status_code != 200:
                            raise Exception(f"Gemini error: Status {response.status_code} - {response.text}")
                        
                        data = response.json()
                        # Extract candidates text
                        candidates = data.get("candidates", [])
                        if not candidates:
                            raise Exception(f"Gemini returned empty candidates: {data}")
                        
                        content = candidates[0].get("content", {})
                        parts = content.get("parts", [])
                        if not parts:
                            raise Exception(f"Gemini returned empty parts: {data}")
                        
                        response_text = parts[0].get("text", "")
                        return {
                            "content": response_text,
                            "provider": provider["name"],
                            "model": provider["model"]
                        }

                elif provider["type"] == "openrouter":
                    # Format OpenRouter API Request
                    headers = {
                        "Authorization": f"Bearer {provider['key']}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://github.com/google/antigravity",
                        "X-Title": "WorkSphere AI"
                    }
                    messages = []
                    if system_prompt:
                        messages.append({"role": "system", "content": system_prompt})
                    messages.append({"role": "user", "content": prompt})

                    payload = {
                        "model": provider["model"],
                        "messages": messages,
                        "temperature": temperature
                    }

                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.post(provider["url"], json=payload, headers=headers)
                        if response.status_code != 200:
                            raise Exception(f"OpenRouter error: Status {response.status_code} - {response.text}")
                        
                        data = response.json()
                        choices = data.get("choices", [])
                        if not choices:
                            raise Exception(f"OpenRouter returned empty choices: {data}")
                        
                        response_text = choices[0].get("message", {}).get("content", "")
                        return {
                            "content": response_text,
                            "provider": provider["name"],
                            "model": provider["model"]
                        }

            except Exception as e:
                error_msg = f"{provider['name']} failed: {str(e)}"
                print(f"[SmartLLM] Warning: {error_msg}")
                errors.append(error_msg)
                continue

        # If all providers fail, raise exception summarizing errors
        all_errors_summary = " | ".join(errors)
        raise RuntimeError(f"All LLM providers failed. Details: {all_errors_summary}")
