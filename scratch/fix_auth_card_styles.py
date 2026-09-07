import os
import re

css_files = [
    "/Users/girisha/Communication_assessment/css/style.css",
    "/Users/girisha/Communication_assessment/clean_repository/css/style.css",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/css/style.css"
]

html_files = [
    "/Users/girisha/Communication_assessment/admin.html",
    "/Users/girisha/Communication_assessment/clean_repository/admin.html",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/www/comm_assess/admin.html"
]

auth_css_fix = """

/* ── AUTH CARD & SIGN IN OVERLAY FIX ── */
.auth-overlay {
  position: fixed !important;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.45) !important;
  backdrop-filter: blur(4px) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 1000 !important;
}

.auth-card {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 8px !important;
  padding: 2.25rem 2rem !important;
  width: 100% !important;
  max-width: 400px !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
  text-align: center !important;
}

.auth-card .auth-logo {
  width: 52px !important;
  height: 52px !important;
  background: #2490ef !important;
  color: #ffffff !important;
  border-radius: 8px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-weight: 700 !important;
  font-size: 1.25rem !important;
  margin: 0 auto 1rem !important;
}

.auth-card h2 {
  color: #1f2937 !important;
  font-size: 1.35rem !important;
  font-weight: 700 !important;
  margin: 0 0 0.4rem !important;
}

.auth-card p {
  color: #6b7280 !important;
  font-size: 0.875rem !important;
  margin: 0 0 1.25rem !important;
}

.auth-card input[type=text],
.auth-card input[type=password] {
  width: 100% !important;
  padding: 0.7rem 0.9rem !important;
  background: #ffffff !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  color: #1f2937 !important;
  font-size: 0.9rem !important;
  outline: none !important;
  transition: border-color 0.15s !important;
  box-sizing: border-box !important;
  margin-bottom: 0.75rem !important;
}

.auth-card input[type=text]:focus,
.auth-card input[type=password]:focus {
  border-color: #2490ef !important;
  box-shadow: 0 0 0 2px rgba(36, 144, 239, 0.15) !important;
}

.auth-card input[type=text]::placeholder,
.auth-card input[type=password]::placeholder {
  color: #9ca3af !important;
}

.auth-card .btn-primary {
  width: 100% !important;
  background: #2490ef !important;
  color: #ffffff !important;
  padding: 0.75rem !important;
  border-radius: 6px !important;
  font-weight: 500 !important;
  font-size: 0.95rem !important;
  cursor: pointer !important;
  border: none !important;
  margin-top: 0.25rem !important;
}

.auth-card .btn-primary:hover {
  background: #1d7cd1 !important;
}

.auth-card a {
  color: #4b5563 !important;
  text-decoration: none !important;
}

.auth-card a:hover {
  color: #2490ef !important;
  text-decoration: underline !important;
}

.error-msg {
  color: #dc2626 !important;
  background: #fef2f2 !important;
  border: 1px solid #fca5a5 !important;
  border-radius: 6px !important;
  padding: 0.5rem 0.75rem !important;
  font-size: 0.8125rem !important;
  margin-top: 0.75rem !important;
}
"""

for target in css_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        if "AUTH CARD & SIGN IN OVERLAY FIX" in content:
            content = content.split("/* ── AUTH CARD & SIGN IN OVERLAY FIX ── */")[0]

        new_content = content + auth_css_fix
        with open(target, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Fixed auth card CSS in {target}")

for target in html_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        content = content.replace("style=\"color:rgba(255,255,255,0.35);font-size:0.8rem;text-decoration:none\"", "style=\"color:#6b7280;font-size:0.8rem;text-decoration:none\"")
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated HTML links in {target}")

