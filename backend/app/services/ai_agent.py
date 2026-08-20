import os
import json
import httpx
from app.core.config import settings
from app.prompts.system_prompts import REPORT_PARSER_SYSTEM_PROMPT
from typing import Dict, Any

class AIAgentService:
    @staticmethod
    async def parse_report(report_text: str) -> Dict[str, Any]:
        # Retrieve key from settings or OS environment
        api_key = settings.OPEN_ROUTER_API_KEY or os.environ.get("Open_Router_1")
        
        if not api_key:
            # Return safe fallback if no key is present
            return {
                "summary": f"[Fallback Summary] submitted report of {len(report_text)} characters. Please configure OpenRouter API key for active processing.",
                "blockers": [],
                "metrics": {"char_count": len(report_text)}
            }
            
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/google/antigravity",
            "X-Title": "WorkSphere AI"
        }
        
        # We use openai/gpt-4o-mini as a high-quality model for JSON extraction
        payload = {
            "model": "openai/gpt-4o-mini",
            "messages": [
                {"role": "system", "content": REPORT_PARSER_SYSTEM_PROMPT},
                {"role": "user", "content": report_text}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code != 200:
                    raise Exception(f"OpenRouter returned status {response.status_code}: {response.text}")
                
                result = response.json()
                content = result["choices"][0]["message"]["content"]
                
                # Parse output content as JSON
                parsed_data = json.loads(content.strip())
                
                # Standardize keys
                return {
                    "summary": parsed_data.get("summary", ""),
                    "blockers": parsed_data.get("blockers", []),
                    "metrics": parsed_data.get("metrics", {})
                }
        except Exception as e:
            # Fallback in case of network or JSON parse errors
            print(f"Error in AIAgentService.parse_report: {e}")
            return {
                "summary": f"Report parsed with fallback: {report_text[:100]}...",
                "blockers": ["AI_PARSING_FAILED"],
                "metrics": {"error": str(e), "char_count": len(report_text)}
            }
