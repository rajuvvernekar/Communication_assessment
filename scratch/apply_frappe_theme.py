import re
import os

css_files = [
    "/Users/girisha/Communication_assessment/css/style.css",
    "/Users/girisha/Communication_assessment/clean_repository/css/style.css",
    "/Users/girisha/Communication_assessment/comm_assess/comm_assess/public/css/style.css"
]

frappe_theme_override = """

/* ============================================================
   Frappe Desk Minimalist Plain Theme Overrides
   ============================================================ */

:root {
  --bg: #f4f5f6;
  --surface: #ffffff;
  --sidebar: #1f2937;
  --sidebar-text: #9ca3af;
  --sidebar-active: #ffffff;
  --primary: #2490ef;
  --primary-hover: #1d7cd1;
  --text: #1f2937;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;

  --ps-color: #2490ef;
  --mc-color: #2490ef;
  --rp-color: #2490ef;
  --gd-color: #2490ef;
  --wc-color: #2490ef;
  --ga-color: #2490ef;
  --la-color: #2490ef;
  --smq-color: #2490ef;

  --radius: 6px;
  --shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
}

body {
  background: #f4f5f6 !important;
  color: #1f2937 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
}

#app-header {
  background: #ffffff !important;
  border-bottom: 1px solid #e5e7eb !important;
  box-shadow: none !important;
}

#app-header .header-logo {
  color: #1f2937 !important;
  font-weight: 700 !important;
}

#screen-welcome {
  background: #f4f5f6 !important;
}

.auth-logo-block .logo-icon {
  background: #2490ef !important;
  border-radius: 6px !important;
  box-shadow: none !important;
  color: #ffffff !important;
}

.auth-logo-block h1 {
  color: #1f2937 !important;
  font-weight: 700 !important;
}

.auth-logo-block p {
  color: #6b7280 !important;
}

.auth-card {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 8px !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
  backdrop-filter: none !important;
}

.auth-card h2 {
  color: #1f2937 !important;
  font-weight: 600 !important;
}

.auth-field label {
  color: #374151 !important;
  font-weight: 500 !important;
}

.auth-field input {
  background: #ffffff !important;
  border: 1px solid #d1d5db !important;
  color: #1f2937 !important;
  border-radius: 6px !important;
}

.auth-field input:focus {
  border-color: #2490ef !important;
  box-shadow: 0 0 0 2px rgba(36, 144, 239, 0.15) !important;
}

.auth-toggle {
  color: #6b7280 !important;
}

.auth-toggle a {
  color: #2490ef !important;
}

.module-card {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 6px !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
  transition: border-color 0.15s, box-shadow 0.15s !important;
}

.module-card:hover {
  transform: none !important;
  border-color: #2490ef !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.08) !important;
}

.module-icon {
  background: #f3f4f6 !important;
  border-radius: 6px !important;
  width: 44px !important;
  height: 44px !important;
  font-size: 1.3rem !important;
}

.module-card h3 {
  color: #1f2937 !important;
  font-weight: 600 !important;
}

.module-card p {
  color: #6b7280 !important;
}

.module-tag {
  background: #f3f4f6 !important;
  color: #4b5563 !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 4px !important;
  font-weight: 500 !important;
}

.btn-primary {
  background: #2490ef !important;
  color: #ffffff !important;
  border-radius: 6px !important;
  font-weight: 500 !important;
  box-shadow: none !important;
}

.btn-primary:hover {
  background: #1d7cd1 !important;
  transform: none !important;
}

.btn-secondary {
  background: #ffffff !important;
  color: #374151 !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  font-weight: 500 !important;
}

.btn-secondary:hover {
  background: #f9fafb !important;
  border-color: #9ca3af !important;
}

.step-card {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 6px !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
}

.ps-cat-card {
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 6px !important;
}

.ps-cat-card:hover {
  border-color: #2490ef !important;
  transform: none !important;
}

.auth-overlay {
  background: rgba(0,0,0,0.4) !important;
}

.auth-card {
  background: #ffffff !important;
}
"""

for target in css_files:
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        # Remove previous override block if exists
        if "Frappe Desk Minimalist Plain Theme Overrides" in content:
            content = content.split("/* ====================================================\n   Frappe Desk Minimalist Plain Theme Overrides")[0]

        new_content = content + frappe_theme_override
        with open(target, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Applied Frappe plain theme to {target}")

