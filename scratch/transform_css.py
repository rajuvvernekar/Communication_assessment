import re

css_path = "/Users/girisha/Communication_assessment/css/style.css"

with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

# 1. Replace root variables with Frappe design tokens
old_root_pattern = r":root\s*\{[^}]+\}"
frappe_root = """:root {
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

  /* Plain Frappe minimal module colors */
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
  --shadow-lg: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
}"""

css = re.sub(old_root_pattern, frappe_root, css, count=1)

# 2. Transform Welcome / Auth Screen from dark gradient / glassmorphic to clean white / Frappe light gray
css = re.sub(
    r"#screen-welcome\s*\{[^}]+\}",
    """#screen-welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  min-height: 100vh;
}""",
    css
)

css = re.sub(
    r"\.auth-logo-block\s+\.logo-icon\s*\{[^}]+\}",
    """.auth-logo-block .logo-icon {
  width: 52px; height: 52px;
  background: var(--primary);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.25rem;
  color: #fff;
  margin-bottom: 0.75rem;
}""",
    css
)

css = re.sub(
    r"\.auth-logo-block\s+h1\s*\{[^}]+\}",
    """.auth-logo-block h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}""",
    css
)

css = re.sub(
    r"\.auth-logo-block\s+p\s*\{[^}]+\}",
    """.auth-logo-block p {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0.25rem 0 0;
}""",
    css
)

css = re.sub(
    r"\.auth-card\s*\{[^}]+\}",
    """.auth-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2rem;
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow);
}""",
    css
)

css = re.sub(
    r"\.auth-card\s+h2\s*\{[^}]+\}",
    """.auth-card h2 {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 1.25rem;
}""",
    css
)

css = re.sub(
    r"\.auth-field\s+label\s*\{[^}]+\}",
    """.auth-field label {
  display: block;
  color: var(--text);
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.35rem;
}""",
    css
)

css = re.sub(
    r"\.auth-field\s+input\s*\{[^}]+\}",
    """.auth-field input {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: var(--text);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}""",
    css
)

css = re.sub(
    r"\.auth-field\s+input:focus\s*\{[^}]+\}",
    """.auth-field input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(36, 144, 239, 0.15);
}""",
    css
)

css = re.sub(
    r"\.auth-toggle\s*\{[^}]+\}",
    """.auth-toggle {
  text-align: center;
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-top: 1rem;
  margin-bottom: 0;
}""",
    css
)

css = re.sub(
    r"\.auth-toggle\s+a\s*\{[^}]+\}",
    """.auth-toggle a { color: var(--primary); font-weight: 500; text-decoration: none; }""",
    css
)

with open(css_path, "w", encoding="utf-8") as f:
    f.write(css)

print("CSS transformed successfully!")
